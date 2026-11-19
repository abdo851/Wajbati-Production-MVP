import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();

const { PrismaClient } = await import("@prisma/client");
const { atomicPlaceOrder, atomicDeliverWithOtp } = await import("../../src/lib/db/order-writes.ts");
const { codesMatch, newDeliveryCode } = await import("../../src/lib/delivery-code.ts");
const { StoreError } = await import("../../src/lib/errors.ts");
const { checkRateLimitAsync } = await import("../../src/lib/rate-limit.ts");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

const PREFIX = `otpsec-${Date.now()}-`;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedPickedUpOrder(code) {
  const suffix = randomUUID().slice(0, 8);
  const chefUserId = `${PREFIX}chef-${suffix}`;
  const mealId = `${PREFIX}meal-${suffix}`;
  const orderId = `${PREFIX}order-${suffix}`;
  const driverId = `${PREFIX}driver-${suffix}`;
  await prisma.user.create({
    data: {
      id: chefUserId,
      email: `${PREFIX}chef-${suffix}@example.test`,
      password: hash("x"),
      fullName: "OTP Chef",
      role: "CHEF",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
    },
  });
  await prisma.user.create({
    data: {
      id: driverId,
      email: `${PREFIX}driver-${suffix}@example.test`,
      password: hash("x"),
      fullName: "OTP Driver",
      role: "DRIVER",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
    },
  });
  await prisma.meal.create({
    data: {
      id: mealId,
      chefId: chefUserId,
      title: "OTP Meal",
      description: "otp",
      price: 30,
      quantity: 2,
      remainingQuantity: 2,
      isPublished: true,
      serviceDate: new Date(),
    },
  });
  await atomicPlaceOrder({
    id: orderId,
    mealId,
    chefId: chefUserId,
    quantity: 1,
    customerName: "OTP Customer",
    customerPhone: "212611122233",
    deliveryAddress: "OTP Street",
    deliveryLat: null,
    deliveryLng: null,
    customerNotes: "",
    unitPriceMad: 30,
    totalMad: 30,
    otpHash: hash(code),
    otpExpiry: new Date(Date.now() + 600_000),
    deliveryCode: code,
    trackToken: `${PREFIX}track-${suffix}`,
    createdAt: new Date(),
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { flowStatus: "picked_up", status: "ACCEPTED", driverId },
  });
  return { orderId, driverId, mealId };
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.meal.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${"otpsec:%"}`;
}

before(async () => {
  assert.equal(identity.database, "righ_test");
  const info = await prisma.$queryRaw`select current_database() as db`;
  assert.equal(info[0].db, "righ_test");
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("OTP security on isolated DB", () => {
  it("rejects wrong OTP, increments attempts, and blocks after 3 failures", async () => {
    const code = "4821";
    const { orderId, driverId } = await seedPickedUpOrder(code);
    const verify = (given, stored) => hash(given) === stored;

    await assert.rejects(
      () => atomicDeliverWithOtp({ orderId, driverId, code: "0000", verify }),
      StoreError,
    );
    let order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.otpAttempts, 1);
    assert.equal(order.flowStatus, "picked_up");

    await assert.rejects(() => atomicDeliverWithOtp({ orderId, driverId, code: "1111", verify }), StoreError);
    await assert.rejects(() => atomicDeliverWithOtp({ orderId, driverId, code: "2222", verify }), StoreError);
    order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.otpAttempts, 3);
    assert.equal(order.flowStatus, "picked_up");

    await assert.rejects(() => atomicDeliverWithOtp({ orderId, driverId, code, verify }), StoreError);
    order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "picked_up");
  });

  it("OTP for one order cannot deliver a different order", async () => {
    const codeA = "1357";
    const codeB = "2468";
    const a = await seedPickedUpOrder(codeA);
    const b = await seedPickedUpOrder(codeB);
    const verify = (given, stored) => hash(given) === stored;

    await assert.rejects(
      () => atomicDeliverWithOtp({ orderId: b.orderId, driverId: b.driverId, code: codeA, verify }),
      StoreError,
    );
    const orderB = await prisma.order.findUnique({ where: { id: b.orderId } });
    assert.equal(orderB.flowStatus, "picked_up");

    await atomicDeliverWithOtp({ orderId: a.orderId, driverId: a.driverId, code: codeA, verify });
    const orderA = await prisma.order.findUnique({ where: { id: a.orderId } });
    assert.equal(orderA.flowStatus, "delivered");
    assert.equal(orderA.paymentStatus, "due_on_delivery");
  });

  it("expired OTP is rejected", async () => {
    const code = "9999";
    const { orderId, driverId } = await seedPickedUpOrder(code);
    await prisma.order.update({
      where: { id: orderId },
      data: { otpExpiry: new Date(Date.now() - 1000) },
    });
    await assert.rejects(
      () =>
        atomicDeliverWithOtp({
          orderId,
          driverId,
          code,
          verify: (given, stored) => hash(given) === stored,
        }),
      StoreError,
    );
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "picked_up");
  });

  it("delivery-code helper stays 4 digits and timing-safe", () => {
    const code = newDeliveryCode();
    assert.match(code, /^\d{4}$/);
    assert.equal(codesMatch(code, code), true);
    assert.equal(codesMatch(code, "0000") || code === "0000", code === "0000" ? true : false);
  });

  it("OTP attempt rate-limit bucket denies after max", async () => {
    const key = `otpsec:${randomUUID()}`;
    assert.equal(await checkRateLimitAsync(key, 2, 60_000, "closed"), true);
    assert.equal(await checkRateLimitAsync(key, 2, 60_000, "closed"), true);
    assert.equal(await checkRateLimitAsync(key, 2, 60_000, "closed"), false);
  });
});
