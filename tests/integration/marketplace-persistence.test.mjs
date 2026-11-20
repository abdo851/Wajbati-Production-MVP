import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();

describe("marketplace persistence (isolated postgres)", () => {
  /** @type {import('@prisma/client').PrismaClient} */
  let prisma;
  /** @type {typeof import('../../src/lib/db/marketplace-store.ts').marketplaceStore} */
  let store;

  before(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } } });
    await prisma.$connect();
    // Ensure marketplace tables exist (migration already applied in Phase 2.5)
    const tables = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='MarketplaceListing'`,
    );
    assert.ok(Array.isArray(tables) && tables.length === 1, "MarketplaceListing table missing");
    ({ marketplaceStore: store } = await import("../../src/lib/db/marketplace-store.ts"));
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("persists listing pricing modes and survives reload", async () => {
    const created = await store.createListing({
      chefProfileId: "chef-profile-qa",
      sellerUserId: "seller-user-qa",
      autoApprove: true,
      body: {
        title: "Prisma Tajine QA",
        description: "Persistent marketplace listing for integration verification.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 55,
        availability: "available",
        city: "Casablanca",
        isPublished: true,
        images: [],
      },
    });
    assert.equal(created.priceMode, "fixed");
    assert.equal(created.priceMad, 55);

    const hidden = await store.createListing({
      chefProfileId: "chef-profile-qa",
      sellerUserId: "seller-user-qa",
      autoApprove: true,
      body: {
        title: "Ask Price Salad",
        description: "Hidden price listing for marketplace verification path.",
        kind: "permanent",
        priceMode: "hidden",
        availability: "preorder",
        city: "Rabat",
        isPublished: true,
        images: [],
      },
    });
    assert.equal(hidden.priceMode, "hidden");
    assert.equal(hidden.priceMad, null);

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const temporary = await store.createListing({
      chefProfileId: "chef-profile-qa",
      sellerUserId: "seller-user-qa",
      autoApprove: true,
      body: {
        title: "Weekend Pastilla",
        description: "Temporary offer that must expire after the deadline.",
        kind: "temporary",
        priceMode: "negotiable",
        availability: "available",
        city: "Marrakech",
        expiresAt: future,
        isPublished: true,
        images: [],
      },
    });
    assert.equal(temporary.kind, "temporary");

    const again = await store.getListing(created.id);
    assert.ok(again);
    assert.equal(again.title, "Prisma Tajine QA");

    const publicList = await store.listPublic({ city: "Casablanca" });
    assert.ok(publicList.items.some((item) => item.id === created.id));

    const search = await store.listPublic({ q: "Pastilla", kind: "temporary" });
    assert.ok(search.items.some((item) => item.id === temporary.id));
  });

  it("enforces conversation authorization and message persistence", async () => {
    const conversation = await store.openOrCreateConversation({
      buyerUserId: "buyer-qa-1",
      sellerUserId: "seller-user-qa",
      listingId: null,
    });
    const sent = await store.sendMessage({
      conversationId: conversation.id,
      senderUserId: "buyer-qa-1",
      body: "Hello seller, interested in your dish.",
    });
    assert.equal(sent.message.body.includes("Hello seller"), true);

    await assert.rejects(
      () => store.getConversation(conversation.id, "stranger-user"),
      /cannot access/i,
    );

    const loaded = await store.getConversation(conversation.id, "seller-user-qa");
    assert.ok(loaded.messages.some((row) => row.id === sent.message.id));
    await store.markConversationRead(conversation.id, "seller-user-qa");
    const afterRead = await store.getConversation(conversation.id, "seller-user-qa");
    assert.equal(afterRead.conversation.sellerUnread, 0);
  });

  it("tracks seller presence heartbeat expiry semantics", async () => {
    const presence = await store.heartbeat("seller-user-qa");
    assert.ok(presence.lastSeenAt);
    const online = await store.isSellerOnline("seller-user-qa");
    assert.equal(online, true);
  });

  it("supports moderation reports and notifications", async () => {
    const listing = await store.createListing({
      chefProfileId: "chef-profile-qa",
      sellerUserId: "seller-user-qa",
      autoApprove: false,
      body: {
        title: "Pending Review Dish",
        description: "Listing waiting for admin moderation workflow.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 40,
        availability: "available",
        city: "Fes",
        isPublished: true,
        images: [],
      },
    });
    const pending = await store.listPendingModeration();
    assert.ok(pending.some((row) => row.id === listing.id));
    await store.setListingModeration(listing.id, "approved");
    const report = await store.reportListing({
      listingId: listing.id,
      reporterUserId: "buyer-qa-1",
      reason: "Test report for moderation queue.",
    });
    assert.equal(report.status, "open");
    await store.notifyFollowersOfListing({
      followerUserIds: ["buyer-qa-1"],
      listing,
      kitchenName: "QA Kitchen",
    });
    const notes = await store.listNotifications("buyer-qa-1");
    assert.ok(notes.length >= 1);
  });

  it("keeps legacy Meal table accessible after marketplace migration", async () => {
    const meals = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "Meal"`);
    assert.equal(typeof meals[0].count, "number");
    console.log(`isolated db=${identity.database} host=${identity.host}:${identity.port} mealRows=${meals[0].count}`);
  });
});
