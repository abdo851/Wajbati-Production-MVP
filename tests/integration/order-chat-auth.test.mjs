import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();

const { PrismaClient } = await import("@prisma/client");
const { localRepository } = await import("../../src/lib/db/local-store.ts");
const { atomicPlaceOrder } = await import("../../src/lib/db/order-writes.ts");
const { StoreError } = await import("../../src/lib/errors.ts");
const { orderThreadId } = await import("../../src/lib/order-chat.ts");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

const PREFIX = `chat-${Date.now()}-`;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedOrderChatFixture() {
  const suffix = randomUUID().slice(0, 8);
  const customerId = `${PREFIX}customer-${suffix}`;
  const chefUserId = `${PREFIX}chef-user-${suffix}`;
  const otherChefUserId = `${PREFIX}other-chef-${suffix}`;
  const driverId = `${PREFIX}driver-${suffix}`;
  const mealId = `${PREFIX}meal-${suffix}`;
  const orderId = `${PREFIX}order-${suffix}`;
  const phone = "212677788899";

  await prisma.user.createMany({
    data: [
      {
        id: customerId,
        email: `${PREFIX}customer-${suffix}@example.test`,
        phone,
        password: hash("x"),
        fullName: "Chat Customer",
        role: "CUSTOMER",
        approvalStatus: "APPROVED",
        emailConfirmed: true,
      },
      {
        id: chefUserId,
        email: `${PREFIX}chef-${suffix}@example.test`,
        password: hash("x"),
        fullName: "Chat Chef",
        role: "CHEF",
        approvalStatus: "APPROVED",
        emailConfirmed: true,
      },
      {
        id: otherChefUserId,
        email: `${PREFIX}other-${suffix}@example.test`,
        password: hash("x"),
        fullName: "Other Chef",
        role: "CHEF",
        approvalStatus: "APPROVED",
        emailConfirmed: true,
      },
      {
        id: driverId,
        email: `${PREFIX}driver-${suffix}@example.test`,
        password: hash("x"),
        fullName: "Chat Driver",
        role: "DRIVER",
        approvalStatus: "APPROVED",
        emailConfirmed: true,
      },
    ],
  });
  await prisma.chefProfile.create({
    data: { id: `${PREFIX}chef-profile-${suffix}`, userId: chefUserId, kitchenName: "Chat Kitchen" },
  });
  await prisma.chefProfile.create({
    data: { id: `${PREFIX}other-profile-${suffix}`, userId: otherChefUserId, kitchenName: "Other Kitchen" },
  });
  await prisma.meal.create({
    data: {
      id: mealId,
      chefId: chefUserId,
      title: "Chat Meal",
      description: "chat",
      price: 35,
      quantity: 3,
      remainingQuantity: 3,
      isPublished: true,
      serviceDate: new Date(),
    },
  });
  await atomicPlaceOrder({
    id: orderId,
    mealId,
    chefId: chefUserId,
    quantity: 1,
    customerName: "Chat Customer",
    customerPhone: phone,
    deliveryAddress: "Chat Street",
    deliveryLat: null,
    deliveryLng: null,
    customerNotes: "",
    unitPriceMad: 35,
    totalMad: 35,
    otpHash: hash("1234"),
    otpExpiry: new Date(Date.now() + 600_000),
    deliveryCode: "1234",
    trackToken: `${PREFIX}track-${suffix}`,
    createdAt: new Date(),
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { driverId, flowStatus: "assigned", status: "ACCEPTED", customerId },
  });

  return {
    orderId,
    customer: { id: customerId, role: "customer", fullName: "Chat Customer", phone, chefId: null, driverId: null },
    chef: { id: chefUserId, role: "chef", fullName: "Chat Chef", phone: null, chefId: chefUserId, driverId: null },
    otherChef: {
      id: otherChefUserId,
      role: "chef",
      fullName: "Other Chef",
      phone: null,
      chefId: otherChefUserId,
      driverId: null,
    },
    driver: { id: driverId, role: "driver", fullName: "Chat Driver", phone: null, chefId: null, driverId },
    stranger: {
      id: `${PREFIX}stranger-${suffix}`,
      role: "customer",
      fullName: "Stranger",
      phone: "212600000000",
      chefId: null,
      driverId: null,
    },
  };
}

async function cleanup() {
  await prisma.message.deleteMany({ where: { threadId: { startsWith: "order:" } } }).catch(() => undefined);
  await prisma.order.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.meal.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.chefProfile.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
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

describe("order chat authorization and persistence", () => {
  it("customer and assigned chef can exchange chef-peer messages; others are rejected", async () => {
    const fx = await seedOrderChatFixture();
    const chefThread = orderThreadId(fx.orderId, "chef");
    const driverThread = orderThreadId(fx.orderId, "driver");

    const first = await localRepository.sendDirectMessage(fx.customer, {
      body: "Salam chef",
      mealId: null,
      orderId: fx.orderId,
      threadId: null,
      peer: "chef",
    });
    assert.equal(first.threadId, chefThread);
    assert.equal(first.messages.length, 1);
    assert.equal(first.messages[0].body, "Salam chef");
    assert.equal(first.messages[0].senderRole, "customer");

    const reply = await localRepository.sendDirectMessage(fx.chef, {
      body: "Ready soon",
      mealId: null,
      orderId: fx.orderId,
      threadId: null,
      peer: "chef",
    });
    assert.equal(reply.threadId, chefThread);
    assert.equal(reply.messages.length, 2);
    assert.equal(reply.messages[1].senderRole, "chef");

    const reopened = await localRepository.openDirectThread(fx.customer, {
      mealId: null,
      orderId: fx.orderId,
      threadId: null,
      peer: "chef",
    });
    assert.equal(reopened.messages.length, 2);
    assert.deepEqual(
      reopened.messages.map((m) => m.body),
      ["Salam chef", "Ready soon"],
    );

    await assert.rejects(
      () =>
        localRepository.openDirectThread(fx.otherChef, {
          mealId: null,
          orderId: fx.orderId,
          threadId: null,
          peer: "chef",
        }),
      StoreError,
    );
    await assert.rejects(
      () =>
        localRepository.sendDirectMessage(fx.driver, {
          body: "driver into chef thread",
          mealId: null,
          orderId: fx.orderId,
          threadId: null,
          peer: "chef",
        }),
      StoreError,
    );
    await assert.rejects(
      () =>
        localRepository.sendDirectMessage(fx.stranger, {
          body: "stranger",
          mealId: null,
          orderId: fx.orderId,
          threadId: null,
          peer: "chef",
        }),
      StoreError,
    );

    // Driver peer remains a separate conversation.
    const driverChat = await localRepository.sendDirectMessage(fx.driver, {
      body: "On the way",
      mealId: null,
      orderId: fx.orderId,
      threadId: null,
      peer: "driver",
    });
    assert.equal(driverChat.threadId, driverThread);
    assert.equal(driverChat.messages.length, 1);

    const chefViewOfDriver = await localRepository.openDirectThread(fx.chef, {
      mealId: null,
      orderId: fx.orderId,
      threadId: null,
      peer: "chef",
    });
    assert.equal(chefViewOfDriver.messages.every((m) => m.body !== "On the way"), true);
  });
});
