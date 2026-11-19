import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();

const { PrismaClient } = await import("@prisma/client");
const {
  atomicPlaceOrder,
  atomicConfirmOrder,
  atomicAcceptDelivery,
  atomicAdvanceDelivery,
  atomicDeliverWithOtp,
  atomicCancelOrder,
} = await import("../../src/lib/db/order-writes.ts");
const { StoreError } = await import("../../src/lib/errors.ts");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

const PREFIX = `life-${Date.now()}-`;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedChefMeal(remaining = 2) {
  const suffix = randomUUID().slice(0, 8);
  const chefUserId = `${PREFIX}chef-user-${suffix}`;
  const chefProfileId = `${PREFIX}chef-profile-${suffix}`;
  const mealId = `${PREFIX}meal-${suffix}`;
  await prisma.user.create({
    data: {
      id: chefUserId,
      email: `${PREFIX}chef-${suffix}@example.test`,
      password: hash("x"),
      fullName: "Lifecycle Chef",
      role: "CHEF",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
    },
  });
  await prisma.chefProfile.create({
    data: { id: chefProfileId, userId: chefUserId, kitchenName: "Lifecycle Kitchen" },
  });
  await prisma.meal.create({
    data: {
      id: mealId,
      chefId: chefUserId,
      title: "Lifecycle Meal",
      description: "lifecycle",
      price: 45,
      quantity: remaining,
      remainingQuantity: remaining,
      isPublished: true,
      serviceDate: new Date(),
    },
  });
  return { chefUserId, mealId };
}

async function seedDriver(tag) {
  const id = `${PREFIX}driver-${tag}`;
  await prisma.user.create({
    data: {
      id,
      email: `${PREFIX}${tag}@example.test`,
      password: hash("x"),
      fullName: `Driver ${tag}`,
      role: "DRIVER",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
    },
  });
  return id;
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.meal.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.chefProfile.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

before(async () => {
  assert.match(identity.host, /^(127\.0\.0\.1|localhost)$/);
  assert.equal(identity.database, "righ_test");
  const info = await prisma.$queryRaw`select current_database() as db`;
  assert.equal(info[0].db, "righ_test");
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("order lifecycle on isolated DB", () => {
  it("place → confirm → accept → pick up → deliver with OTP", async () => {
    const { mealId, chefUserId } = await seedChefMeal(2);
    const driverId = await seedDriver("happy");
    const orderId = `${PREFIX}order-happy`;
    const code = "4821";
    const before = await prisma.meal.findUnique({ where: { id: mealId } });

    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "Lifecycle Customer",
      customerPhone: "212600000001",
      deliveryAddress: "Casa",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 45,
      totalMad: 45,
      otpHash: hash(code),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: code,
      trackToken: `${PREFIX}track-happy`,
      createdAt: new Date(),
    });

    let order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "pending");
    assert.equal(order.paymentStatus, "due_on_delivery");
    const afterPlace = await prisma.meal.findUnique({ where: { id: mealId } });
    assert.equal(afterPlace.remainingQuantity, before.remainingQuantity - 1);

    await atomicConfirmOrder({ orderId, chefId: chefUserId });
    order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "confirmed");

    await atomicAcceptDelivery({ orderId, driverId });
    order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "assigned");
    assert.equal(order.driverId, driverId);

    await atomicAdvanceDelivery({
      orderId,
      driverId,
      fromStatuses: ["assigned"],
      toStatus: "picked_up",
    });
    order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "picked_up");

    await atomicDeliverWithOtp({
      orderId,
      driverId,
      code,
      verify: (given, stored) => hash(given) === stored,
    });
    order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "delivered");
    // Delivery completion must not imply settlement.
    assert.equal(order.paymentStatus, "due_on_delivery");
  });

  it("rejects confirm from a different chef and keeps pending", async () => {
    const { mealId, chefUserId } = await seedChefMeal(1);
    const other = await seedChefMeal(1);
    const orderId = `${PREFIX}order-wrong-chef`;
    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "X",
      customerPhone: "212600000002",
      deliveryAddress: "Rabat",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 45,
      totalMad: 45,
      otpHash: hash("1111"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "1111",
      trackToken: `${PREFIX}track-wrong-chef`,
      createdAt: new Date(),
    });
    await assert.rejects(
      () => atomicConfirmOrder({ orderId, chefId: other.chefUserId }),
      StoreError,
    );
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "pending");
  });

  it("cancel restores stock once and rejects a second cancel restore", async () => {
    const { mealId, chefUserId } = await seedChefMeal(3);
    const orderId = `${PREFIX}order-cancel`;
    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "C",
      customerPhone: "212600000003",
      deliveryAddress: "Fes",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 45,
      totalMad: 45,
      otpHash: hash("2222"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "2222",
      trackToken: `${PREFIX}track-cancel`,
      createdAt: new Date(),
    });
    const mid = await prisma.meal.findUnique({ where: { id: mealId } });
    const restored = await atomicCancelOrder({
      orderId,
      chefId: chefUserId,
      fromStatuses: ["pending"],
      restoreQuantity: true,
    });
    assert.ok(restored);
    const after = await prisma.meal.findUnique({ where: { id: mealId } });
    assert.equal(after.remainingQuantity, mid.remainingQuantity + 1);
    const second = await atomicCancelOrder({
      orderId,
      chefId: chefUserId,
      fromStatuses: ["pending", "confirmed"],
      restoreQuantity: true,
    });
    assert.equal(second, null);
    const finalMeal = await prisma.meal.findUnique({ where: { id: mealId } });
    assert.equal(finalMeal.remainingQuantity, after.remainingQuantity);
  });

  it("wrong driver cannot advance or deliver another driver's order", async () => {
    const { mealId, chefUserId } = await seedChefMeal(1);
    const owner = await seedDriver("owner");
    const stranger = await seedDriver("stranger");
    const orderId = `${PREFIX}order-driver-auth`;
    const code = "3333";
    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "D",
      customerPhone: "212600000004",
      deliveryAddress: "Tangier",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 45,
      totalMad: 45,
      otpHash: hash(code),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: code,
      trackToken: `${PREFIX}track-driver-auth`,
      createdAt: new Date(),
    });
    await atomicConfirmOrder({ orderId, chefId: chefUserId });
    await atomicAcceptDelivery({ orderId, driverId: owner });
    await assert.rejects(
      () =>
        atomicAdvanceDelivery({
          orderId,
          driverId: stranger,
          fromStatuses: ["assigned"],
          toStatus: "picked_up",
        }),
      StoreError,
    );
    await atomicAdvanceDelivery({
      orderId,
      driverId: owner,
      fromStatuses: ["assigned"],
      toStatus: "picked_up",
    });
    await assert.rejects(
      () =>
        atomicDeliverWithOtp({
          orderId,
          driverId: stranger,
          code,
          verify: (given, stored) => hash(given) === stored,
        }),
      StoreError,
    );
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order.flowStatus, "picked_up");
    assert.equal(order.driverId, owner);
  });
});
