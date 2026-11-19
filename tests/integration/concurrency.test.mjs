import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it, before, after } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();

const { PrismaClient } = await import("@prisma/client");
const {
  atomicPlaceOrder,
  atomicAcceptDelivery,
  atomicCancelOrder,
  atomicDeliverWithOtp,
} = await import("../../src/lib/db/order-writes.ts");
const { bumpDataRevision, readDataRevision, assertAndBumpDataRevision } = await import(
  "../../src/lib/db/data-revision.ts"
);
const { loadGraph, saveGraph, graphDataRevision } = await import("../../src/lib/db/prisma-io.ts");
const { checkRateLimitAsync } = await import("../../src/lib/rate-limit.ts");
const { recordAdminAudit } = await import("../../src/lib/audit-log.ts");
const { StoreError } = await import("../../src/lib/errors.ts");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

const PREFIX = `itest-${Date.now()}-`;
const results = [];

function mark(name, status, detail = "") {
  results.push({ name, status, detail });
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedChefMeal(remaining = 1) {
  const suffix = randomUUID().slice(0, 8);
  const chefUserId = `${PREFIX}chef-user-${suffix}`;
  const chefProfileId = `${PREFIX}chef-profile-${suffix}`;
  const mealId = `${PREFIX}meal-${suffix}`;
  await prisma.user.create({
    data: {
      id: chefUserId,
      email: `${PREFIX}chef-${suffix}@example.test`,
      password: hash("x"),
      fullName: "Integration Chef",
      role: "CHEF",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
    },
  });
  await prisma.chefProfile.create({
    data: {
      id: chefProfileId,
      userId: chefUserId,
      kitchenName: "Test Kitchen",
    },
  });
  await prisma.meal.create({
    data: {
      id: mealId,
      chefId: chefUserId,
      title: "Test Meal",
      description: "integration",
      price: 40,
      quantity: remaining,
      remainingQuantity: remaining,
      isPublished: true,
      serviceDate: new Date(),
    },
  });
  return { chefUserId, mealId };
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.meal.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.chefProfile.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.driverProfile.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "actorId" LIKE ${PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${"itest:%"}`;
  await prisma.$executeRaw`DELETE FROM "OrderStatusEvent" WHERE "orderId" LIKE ${PREFIX + "%"}`.catch(
    () => undefined,
  );
}

before(async () => {
  assert.match(identity.host, /^(127\.0\.0\.1|localhost)$/);
  assert.notEqual(identity.host.includes("supabase"), true);
  const info = await prisma.$queryRaw`select current_database() as db, inet_server_addr()::text as addr`;
  assert.equal(info[0].db, identity.database);
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
  console.log(
    "\nINTEGRATION_SUMMARY " +
      JSON.stringify({
        identity: { host: identity.host, port: identity.port, database: identity.database },
        results,
      }),
  );
});

describe("isolated concurrency suite", () => {
  it("1) concurrent reservation of the last meal portion", async () => {
    const { mealId, chefUserId } = await seedChefMeal(1);
    const mk = (n) => ({
      id: `${PREFIX}order-race-${n}`,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: `C${n}`,
      customerPhone: `060000000${n}`,
      deliveryAddress: "Test",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash: hash(`otp-${n}`),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: `11111${n}`,
      trackToken: `${PREFIX}track-race-${n}`,
      createdAt: new Date(),
    });
    const settled = await Promise.allSettled([atomicPlaceOrder(mk(1)), atomicPlaceOrder(mk(2))]);
    const wins = settled.filter((s) => s.status === "fulfilled").length;
    const losses = settled.filter((s) => s.status === "rejected").length;
    const meal = await prisma.meal.findUnique({ where: { id: mealId } });
    const orders = await prisma.order.count({ where: { mealId } });
    assert.equal(wins, 1);
    assert.equal(losses, 1);
    assert.equal(meal.remainingQuantity, 0);
    assert.equal(orders, 1);
    mark("concurrent_last_meal", "PASS", `wins=${wins} losses=${losses}`);
  });

  it("2) two drivers racing accept", async () => {
    const { mealId, chefUserId } = await seedChefMeal(2);
    const orderId = `${PREFIX}order-accept`;
    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "A",
      customerPhone: "0611111111",
      deliveryAddress: "X",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash: hash("otp"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "222222",
      trackToken: `${PREFIX}track-accept`,
      createdAt: new Date(),
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { flowStatus: "confirmed", status: "READY" },
    });
    const d1 = `${PREFIX}driver-1`;
    const d2 = `${PREFIX}driver-2`;
    for (const [id, email] of [
      [d1, `${PREFIX}d1@example.test`],
      [d2, `${PREFIX}d2@example.test`],
    ]) {
      await prisma.user.create({
        data: {
          id,
          email,
          password: hash("x"),
          fullName: "Driver",
          role: "DRIVER",
          approvalStatus: "APPROVED",
          emailConfirmed: true,
        },
      });
    }
    const settled = await Promise.allSettled([
      atomicAcceptDelivery({ orderId, driverId: d1 }),
      atomicAcceptDelivery({ orderId, driverId: d2 }),
    ]);
    const wins = settled.filter((s) => s.status === "fulfilled").length;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(wins, 1);
    assert.ok(order.driverId === d1 || order.driverId === d2);
    assert.equal(order.flowStatus, "assigned");
    mark("concurrent_driver_accept", "PASS", `driver=${order.driverId?.slice(-8)}`);
  });

  it("3) duplicate order submission / retry stock conflict", async () => {
    const { mealId, chefUserId } = await seedChefMeal(1);
    const row = {
      id: `${PREFIX}order-dup`,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "Dup",
      customerPhone: "0622222222",
      deliveryAddress: "Y",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash: hash("dup"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "333333",
      trackToken: `${PREFIX}track-dup`,
      createdAt: new Date(),
    };
    await atomicPlaceOrder(row);
    await assert.rejects(() => atomicPlaceOrder({ ...row, id: `${PREFIX}order-dup-2`, trackToken: `${PREFIX}track-dup-2` }), StoreError);
    const meal = await prisma.meal.findUnique({ where: { id: mealId } });
    assert.equal(meal.remainingQuantity, 0);
    mark("duplicate_order_retry", "PASS");
  });

  it("4-6) OTP valid, replay prevention, exhaustion", async () => {
    const { mealId, chefUserId } = await seedChefMeal(3);
    const orderId = `${PREFIX}order-otp`;
    const code = "445566";
    const otpHash = hash(code);
    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "O",
      customerPhone: "0633333333",
      deliveryAddress: "Z",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash,
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: code,
      trackToken: `${PREFIX}track-otp`,
      createdAt: new Date(),
    });
    const driverId = `${PREFIX}driver-otp`;
    await prisma.user.create({
      data: {
        id: driverId,
        email: `${PREFIX}dotp@example.test`,
        password: hash("x"),
        fullName: "OTP Driver",
        role: "DRIVER",
        approvalStatus: "APPROVED",
        emailConfirmed: true,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { flowStatus: "picked_up", status: "ACCEPTED", driverId },
    });
    const verify = (given, stored) => hash(given) === stored;
    await atomicDeliverWithOtp({ orderId, driverId, code, verify });
    const delivered = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(delivered.flowStatus, "delivered");
    mark("otp_valid_delivery", "PASS");

    await assert.rejects(
      () => atomicDeliverWithOtp({ orderId, driverId, code, verify }),
      StoreError,
    );
    mark("otp_replay_prevention", "PASS");

    const orderId2 = `${PREFIX}order-otp-ex`;
    await atomicPlaceOrder({
      id: orderId2,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "E",
      customerPhone: "0644444444",
      deliveryAddress: "Z",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash: hash("999999"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "999999",
      trackToken: `${PREFIX}track-otp-ex`,
      createdAt: new Date(),
    });
    await prisma.order.update({
      where: { id: orderId2 },
      data: { flowStatus: "picked_up", status: "ACCEPTED", driverId, otpAttempts: 3 },
    });
    await assert.rejects(
      () => atomicDeliverWithOtp({ orderId: orderId2, driverId, code: "000000", verify }),
      StoreError,
    );
    mark("otp_attempt_exhaustion", "PASS");
  });

  it("7) cancellation restores inventory", async () => {
    const { mealId, chefUserId } = await seedChefMeal(2);
    const orderId = `${PREFIX}order-cancel`;
    await atomicPlaceOrder({
      id: orderId,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "K",
      customerPhone: "0655555555",
      deliveryAddress: "C",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash: hash("c"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "121212",
      trackToken: `${PREFIX}track-cancel`,
      createdAt: new Date(),
    });
    const before = await prisma.meal.findUnique({ where: { id: mealId } });
    const restored = await atomicCancelOrder({
      orderId,
      chefId: chefUserId,
      fromStatuses: ["pending"],
      restoreQuantity: true,
    });
    const after = await prisma.meal.findUnique({ where: { id: mealId } });
    assert.ok(restored);
    assert.equal(after.remainingQuantity, before.remainingQuantity + 1);
    mark("cancel_inventory_restore", "PASS");
  });

  it("8) transaction rollback after intermediate failure", async () => {
    const { mealId, chefUserId } = await seedChefMeal(1);
    const before = await prisma.meal.findUnique({ where: { id: mealId } });
    const beforeRev = await readDataRevision(prisma);
    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await tx.meal.update({
            where: { id: mealId },
            data: { remainingQuantity: { decrement: 1 } },
          });
          throw new Error("forced_rollback");
        }),
      /forced_rollback/,
    );
    const after = await prisma.meal.findUnique({ where: { id: mealId } });
    const afterRev = await readDataRevision(prisma);
    assert.equal(after.remainingQuantity, before.remainingQuantity);
    assert.equal(afterRev, beforeRev);
    mark("transaction_rollback", "PASS", `chef=${chefUserId.slice(-6)}`);
  });

  it("9) concurrent RateLimitBucket updates stay within max", async () => {
    const key = `itest:rl:${randomUUID()}`;
    const max = 3;
    const settled = await Promise.all(
      Array.from({ length: 12 }, () => checkRateLimitAsync(key, max, 60_000)),
    );
    const allowed = settled.filter(Boolean).length;
    const denied = settled.length - allowed;
    assert.equal(allowed, max, `expected exactly ${max} allows, got ${allowed}`);
    assert.equal(denied, 12 - max);
    mark("rate_limit_concurrency", "PASS", `allowed=${allowed}; denied=${denied}; residual_race=false`);
  });

  it("9b) rate limit window expiration resets", async () => {
    const key = `itest:rl-window:${randomUUID()}`;
    assert.equal(await checkRateLimitAsync(key, 1, 200), true);
    assert.equal(await checkRateLimitAsync(key, 1, 200), false);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(await checkRateLimitAsync(key, 1, 200), true);
    mark("rate_limit_window_reset", "PASS");
  });

  it("9c) rate limit keys are independent", async () => {
    const a = `itest:rl-a:${randomUUID()}`;
    const b = `itest:rl-b:${randomUUID()}`;
    assert.equal(await checkRateLimitAsync(a, 1, 60_000), true);
    assert.equal(await checkRateLimitAsync(a, 1, 60_000), false);
    assert.equal(await checkRateLimitAsync(b, 1, 60_000), true);
    mark("rate_limit_independent_keys", "PASS");
  });

  it("10) admin AuditLog consistency", async () => {
    const actorId = `${PREFIX}admin-actor`;
    await recordAdminAudit({
      actorId,
      actorEmail: "admin@example.test",
      action: "order.admin_resolve",
      entityType: "order",
      entityId: `${PREFIX}audit-entity`,
      metadata: { ok: true },
    });
    const rows = await prisma.$queryRaw`
      SELECT count(*)::int as n FROM "AuditLog" WHERE "actorId" = ${actorId}
    `;
    assert.equal(rows[0].n, 1);
    mark("admin_audit_consistency", "PASS");
  });

  it("11) saveGraph cannot overwrite newer atomic writes", async () => {
    const { mealId, chefUserId } = await seedChefMeal(2);
    // Bootstrap minimal graph users so loadGraph does not return null after we have data.
    await bumpDataRevision(prisma);
    const graph = await loadGraph();
    // If DB still empty of non-test users, fabricate revision race without full graph:
    if (!graph) {
      const expected = await readDataRevision(prisma);
      await bumpDataRevision(prisma);
      await assert.rejects(() => assertAndBumpDataRevision(prisma, expected), StoreError);
      mark("savegraph_stale_guard", "PASS", "revision-only path");
      return;
    }
    const expected = graphDataRevision(graph);
    assert.equal(typeof expected, "number");
    // Atomic write bumps revision while stale graph is held.
    await atomicPlaceOrder({
      id: `${PREFIX}order-stale`,
      mealId,
      chefId: chefUserId,
      quantity: 1,
      customerName: "Stale",
      customerPhone: "0666666666",
      deliveryAddress: "S",
      deliveryLat: null,
      deliveryLng: null,
      customerNotes: "",
      unitPriceMad: 40,
      totalMad: 40,
      otpHash: hash("s"),
      otpExpiry: new Date(Date.now() + 600_000),
      deliveryCode: "565656",
      trackToken: `${PREFIX}track-stale`,
      createdAt: new Date(),
    });
    await assert.rejects(() => saveGraph(graph), StoreError);
    const stillThere = await prisma.order.findUnique({ where: { id: `${PREFIX}order-stale` } });
    assert.ok(stillThere);
    mark("savegraph_stale_guard", "PASS", "full saveGraph rejected");
  });
});
