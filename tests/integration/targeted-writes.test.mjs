import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it, before, after } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();
const PREFIX = `tw-${Date.now()}-`;

const { PrismaClient } = await import("@prisma/client");
const { localRepository, updateLocalCustomer, confirmLocalEmail } = await import(
  "../../src/lib/db/local-store.ts"
);

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedApprovedChef(walletBalance = 50) {
  const suffix = randomUUID().slice(0, 8);
  const userId = `${PREFIX}chef-user-${suffix}`;
  const chefId = `${PREFIX}chef-profile-${suffix}`;
  await prisma.user.create({
    data: {
      id: userId,
      email: `${PREFIX}chef-${suffix}@example.test`,
      password: hash("x"),
      fullName: "Targeted Chef",
      role: "CHEF",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
      walletBalance,
      isActive: true,
      isDeleted: false,
    },
  });
  await prisma.chefProfile.create({
    data: {
      id: chefId,
      userId,
      kitchenName: "Targeted Kitchen",
      city: "Casablanca",
      isActive: true,
    },
  });
  return { userId, chefId };
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.meal.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.chefProfile.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

before(async () => {
  assert.match(identity.host, /^(127\.0\.0\.1|localhost)$/);
  assert.equal(identity.port, "55432");
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("targeted Prisma writes on isolated DB", () => {
  it("create/update/publish/delete meal without full-graph save", async () => {
    const { chefId } = await seedApprovedChef(80);
    const created = await localRepository.createMeal(chefId, {
      title: "Targeted Tagine",
      description: "integration meal",
      priceMad: 45,
      maxQuantity: 5,
    });
    assert.equal(created.chefId, chefId);
    assert.equal(created.isPublished, true);
    assert.equal(created.maxQuantity, 5);

    const updated = await localRepository.updateMeal(chefId, created.id, {
      title: "Targeted Tagine Plus",
      description: "updated",
      priceMad: 50,
      maxQuantity: 7,
    });
    assert.equal(updated.title, "Targeted Tagine Plus");
    assert.equal(updated.maxQuantity, 7);
    assert.equal(updated.remainingQuantity, 7);

    const unpublished = await localRepository.setMealPublished(chefId, created.id, false);
    assert.equal(unpublished.isPublished, false);
    const republished = await localRepository.setMealPublished(chefId, created.id, true);
    assert.equal(republished.isPublished, true);

    await localRepository.deleteMeal(chefId, created.id);
    const row = await prisma.meal.findUnique({ where: { id: created.id } });
    assert.equal(row?.isDeleted, true);
    assert.equal(row?.isActive, false);
  });

  it("refuses publish when wallet is empty", async () => {
    const { chefId } = await seedApprovedChef(0);
    await assert.rejects(
      () =>
        localRepository.createMeal(chefId, {
          title: "Blocked",
          description: "no wallet",
          priceMad: 20,
          maxQuantity: 1,
        }),
      (error) => error?.status === 403,
    );
  });

  it("updates customer profile with phone uniqueness", async () => {
    const a = `${PREFIX}cust-a-${randomUUID().slice(0, 8)}`;
    const b = `${PREFIX}cust-b-${randomUUID().slice(0, 8)}`;
    await prisma.user.create({
      data: {
        id: a,
        email: `${a}@example.test`,
        password: hash("x"),
        fullName: "A",
        phone: "0600000001",
        role: "CUSTOMER",
        emailConfirmed: true,
      },
    });
    await prisma.user.create({
      data: {
        id: b,
        email: `${b}@example.test`,
        password: hash("x"),
        fullName: "B",
        phone: "0600000002",
        role: "CUSTOMER",
        emailConfirmed: true,
      },
    });
    const updated = await updateLocalCustomer(a, { fullName: "A Updated", phone: "0600000099" });
    assert.equal(updated.fullName, "A Updated");
    assert.equal(updated.phone, "0600000099");
    await assert.rejects(
      () => updateLocalCustomer(b, { fullName: "B", phone: "0600000099" }),
      (error) => error?.status === 409,
    );
  });

  it("confirms email by token via targeted user update", async () => {
    const id = `${PREFIX}confirm-${randomUUID().slice(0, 8)}`;
    const token = `tok-${randomUUID()}`;
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        password: hash("x"),
        fullName: "Confirm Me",
        role: "CUSTOMER",
        emailConfirmed: false,
        confirmationToken: token,
        confirmationExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    assert.equal(await confirmLocalEmail(token), true);
    const row = await prisma.user.findUnique({ where: { id } });
    assert.equal(row?.emailConfirmed, true);
    assert.equal(row?.confirmationToken, null);
  });

  it("attachOrderEmail is idempotent and targeted", async () => {
    const { chefId, userId } = await seedApprovedChef(40);
    const mealId = `${PREFIX}meal-${randomUUID().slice(0, 8)}`;
    const orderId = `${PREFIX}order-${randomUUID().slice(0, 8)}`;
    await prisma.meal.create({
      data: {
        id: mealId,
        chefId,
        title: "Email Meal",
        description: "x",
        price: 30,
        quantity: 1,
        remainingQuantity: 1,
        isPublished: true,
        serviceDate: new Date(),
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        mealId,
        chefId,
        quantity: 1,
        status: "PREPARING",
        flowStatus: "pending",
        otpCode: "1234",
        address: "Test",
        totalPrice: 30,
        customerName: "C",
        customerPhone: "0611111111",
        unitPriceMad: 30,
        commissionPerMealMad: 0,
        commissionMad: 0,
        deliveryFeeMad: 0,
        driverCommissionMad: 0,
        paymentMethod: "cash",
        paymentStatus: "due",
        trackToken: `${PREFIX}track-${randomUUID().slice(0, 8)}`,
      },
    });
    await localRepository.attachOrderEmail(orderId, "first@example.test");
    await localRepository.attachOrderEmail(orderId, "second@example.test");
    const row = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(row?.customerEmail, "first@example.test");
    void userId;
  });
});
