import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();
delete process.env.RIGH_ALLOW_DEMO_SEED;
assert.notEqual(process.env.RIGH_ALLOW_DEMO_SEED, "1");

const DEMO_SEED_IDS = [
  "a1111111-1111-4111-8111-111111111111",
  "a2111111-1111-4111-8111-111111111112",
  "a3111111-1111-4111-8111-111111111113",
  "a4111111-1111-4111-8111-111111111114",
];

const { PrismaClient } = await import("@prisma/client");
const { findLocalUser, localRepository } = await import("../../src/lib/db/local-store.ts");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

before(async () => {
  assert.match(identity.host, /^(127\.0\.0\.1|localhost)$/);
  assert.equal(identity.port, "55432");
});

after(async () => {
  await prisma.$disconnect();
});

describe("seed safety on isolated DB", () => {
  it("read paths do not create demo users when RIGH_ALLOW_DEMO_SEED is unset", async () => {
    // Remove any leftover demo seed rows from prior runs (isolated DB only).
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: DEMO_SEED_IDS } } });
    await prisma.follow.deleteMany({
      where: { OR: [{ customerId: { in: DEMO_SEED_IDS } }, { chefId: { in: DEMO_SEED_IDS } }] },
    });
    await prisma.meal.deleteMany({ where: { chefId: { in: DEMO_SEED_IDS } } });
    await prisma.chefProfile.deleteMany({ where: { userId: { in: DEMO_SEED_IDS } } });
    await prisma.user.deleteMany({ where: { id: { in: DEMO_SEED_IDS } } });

    const before = await prisma.user.count();
    await localRepository.listTodayMeals();
    await findLocalUser("00000000-0000-4000-8000-000000000000");
    const after = await prisma.user.count();
    assert.equal(after, before);

    const seedProfiles = await prisma.user.count({
      where: { id: { in: DEMO_SEED_IDS } },
    });
    assert.equal(seedProfiles, 0);
  });

  it("addEmailCapture is idempotent targeted write", async () => {
    const email = `itest-capture-${Date.now()}@example.test`;
    await localRepository.addEmailCapture(email, "integration");
    await localRepository.addEmailCapture(email, "integration");
    const count = await prisma.emailCapture.count({ where: { email, source: "integration" } });
    assert.equal(count, 1);
    await prisma.emailCapture.deleteMany({ where: { email } });
  });
});
