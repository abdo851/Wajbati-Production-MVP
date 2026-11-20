import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();
const SELLER = { userId: "e2e-seller-user", chefProfileId: "e2e-chef-profile" };
const BUYER = { userId: "e2e-buyer-user" };
const STRANGER = { userId: "e2e-stranger-user" };
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("marketplace E2E journeys (isolated postgres)", () => {
  /** @type {import('@prisma/client').PrismaClient} */
  let prisma;
  /** @type {typeof import('../../src/lib/db/marketplace-store.ts').marketplaceStore} */
  let store;
  /** @type {string[]} */
  const createdListingIds = [];

  before(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } } });
    await prisma.$connect();
    ({ marketplaceStore: store } = await import("../../src/lib/db/marketplace-store.ts"));
    // Clean prior E2E rows for deterministic runs (isolated DB only).
    await prisma.marketplaceMessage.deleteMany({
      where: { OR: [{ senderUserId: BUYER.userId }, { senderUserId: SELLER.userId }] },
    });
    await prisma.marketplaceConversation.deleteMany({
      where: {
        OR: [
          { buyerUserId: BUYER.userId },
          { sellerUserId: SELLER.userId },
          { buyerUserId: STRANGER.userId },
        ],
      },
    });
    await prisma.appNotification.deleteMany({
      where: { userId: { in: [BUYER.userId, SELLER.userId] } },
    });
    await prisma.listingReport.deleteMany({ where: { reporterUserId: BUYER.userId } });
    await prisma.marketplaceListing.deleteMany({ where: { sellerUserId: SELLER.userId } });
    await prisma.sellerPresence.deleteMany({ where: { sellerUserId: SELLER.userId } });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("TASK1: uses isolated DB and keeps JSON import non-destructive", async () => {
    assert.equal(identity.host, "127.0.0.1");
    assert.equal(identity.database, "righ_test");
    assert.ok(existsSync(resolve(process.cwd(), ".env.test.local")));
    // Original JSON path is never deleted by marketplace store.
    const jsonPath = resolve(process.cwd(), "data", "marketplace-store.json");
    // File may or may not exist; if present it must remain after store ops.
    const before = existsSync(jsonPath);
    await store.listPublic({ limit: 1 });
    if (before) assert.equal(existsSync(jsonPath), true);
  });

  it("TASK2: seller creates permanent/negotiable/hidden/temporary listings and updates them", async () => {
    const permanent = await store.createListing({
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.userId,
      autoApprove: true,
      body: {
        title: "E2E Permanent Tajine",
        description: "Permanent listing for seller journey verification with image.",
        category: "tajine",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 70,
        availability: "available",
        city: "Casablanca",
        isPublished: true,
        images: [tinyPng],
      },
    });
    createdListingIds.push(permanent.id);
    assert.equal(permanent.images.length, 1);
    assert.equal(permanent.priceMode, "fixed");

    const negotiable = await store.createListing({
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.userId,
      autoApprove: true,
      body: {
        title: "E2E Negotiable Couscous",
        description: "Negotiable pricing listing for marketplace seller journey.",
        category: "couscous",
        kind: "permanent",
        priceMode: "negotiable",
        availability: "available",
        city: "Casablanca",
        isPublished: true,
        images: [],
      },
    });
    createdListingIds.push(negotiable.id);
    assert.equal(negotiable.priceMad, null);

    const hidden = await store.createListing({
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.userId,
      autoApprove: true,
      body: {
        title: "E2E Hidden Price Soup",
        description: "No displayed price listing for marketplace seller journey.",
        category: "soup",
        kind: "permanent",
        priceMode: "hidden",
        availability: "available",
        city: "Rabat",
        isPublished: true,
        images: [],
      },
    });
    createdListingIds.push(hidden.id);

    const temporary = await store.createListing({
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.userId,
      autoApprove: true,
      body: {
        title: "E2E Temporary Pastilla",
        description: "Temporary offer with future expiration for seller journey.",
        category: "pastilla",
        kind: "temporary",
        priceMode: "fixed",
        priceMad: 90,
        availability: "available",
        city: "Marrakech",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        isPublished: true,
        images: [],
      },
    });
    createdListingIds.push(temporary.id);

    const preorder = await store.updateListing(permanent.id, SELLER.userId, {
      title: permanent.title,
      description: permanent.description,
      category: permanent.category,
      kind: permanent.kind,
      priceMode: permanent.priceMode,
      priceMad: permanent.priceMad,
      availability: "preorder",
      city: permanent.city,
      images: permanent.images,
      isPublished: true,
    });
    assert.equal(preorder.availability, "preorder");

    const soldOut = await store.updateListing(negotiable.id, SELLER.userId, {
      title: negotiable.title,
      description: negotiable.description,
      category: negotiable.category,
      kind: negotiable.kind,
      priceMode: negotiable.priceMode,
      availability: "sold_out",
      city: negotiable.city,
      images: [],
      isPublished: true,
    });
    assert.equal(soldOut.availability, "sold_out");

    const unpublished = await store.updateListing(hidden.id, SELLER.userId, {
      title: "E2E Hidden Price Soup Edited",
      description: hidden.description,
      category: hidden.category,
      kind: hidden.kind,
      priceMode: hidden.priceMode,
      availability: "unavailable",
      city: hidden.city,
      images: [],
      isPublished: false,
    });
    assert.equal(unpublished.isPublished, false);

    const mine = await store.listForChef(SELLER.chefProfileId, true);
    assert.ok(mine.length >= 4);

    const publicStorefront = await store.listPublic({ chefProfileId: SELLER.chefProfileId });
    assert.ok(publicStorefront.items.some((item) => item.id === permanent.id));
    assert.ok(!publicStorefront.items.some((item) => item.id === hidden.id), "unpublished must be hidden");
    assert.ok(publicStorefront.items.some((item) => item.id === soldOut.id));
  });

  it("TASK2/3: public discovery filters and persistence after reload", async () => {
    const byCity = await store.listPublic({ city: "Casablanca" });
    assert.ok(byCity.items.every((item) => item.city === "Casablanca"));
    const byCategory = await store.listPublic({ category: "pastilla" });
    assert.ok(byCategory.items.some((item) => item.title.includes("Pastilla")));

    // Simulate app restart with a fresh store import in a child dynamic import already loaded;
    // re-read via Prisma to prove DB persistence.
    const row = await prisma.marketplaceListing.findFirst({
      where: { sellerUserId: SELLER.userId, title: "E2E Permanent Tajine" },
    });
    assert.ok(row);
    assert.equal(row.images.length, 1);
  });

  it("TASK3/4: messaging requires authorized participants and survives reload", async () => {
    const listing = await prisma.marketplaceListing.findFirst({
      where: { sellerUserId: SELLER.userId, title: "E2E Permanent Tajine" },
    });
    assert.ok(listing);

    const conversation = await store.openOrCreateConversation({
      buyerUserId: BUYER.userId,
      sellerUserId: SELLER.userId,
      listingId: listing.id,
    });

    const buyerMsg = await store.sendMessage({
      conversationId: conversation.id,
      senderUserId: BUYER.userId,
      body: "Hello, is this dish available today?",
    });
    assert.ok(buyerMsg.message.id);

    let forSeller = await store.getConversation(conversation.id, SELLER.userId);
    assert.ok(forSeller.messages.some((m) => m.id === buyerMsg.message.id));
    assert.ok(forSeller.conversation.sellerUnread >= 1);

    const sellerReply = await store.sendMessage({
      conversationId: conversation.id,
      senderUserId: SELLER.userId,
      body: "Yes, available for pickup this evening.",
    });
    assert.ok(sellerReply.message.id);

    await store.markConversationRead(conversation.id, SELLER.userId);
    forSeller = await store.getConversation(conversation.id, SELLER.userId);
    assert.equal(forSeller.conversation.sellerUnread, 0);

    const forBuyer = await store.getConversation(conversation.id, BUYER.userId);
    assert.ok(forBuyer.messages.some((m) => m.id === sellerReply.message.id));

    await assert.rejects(() => store.getConversation(conversation.id, STRANGER.userId), /cannot access/i);
    await assert.rejects(
      () =>
        store.sendMessage({
          conversationId: conversation.id,
          senderUserId: STRANGER.userId,
          body: "Impersonation attempt",
        }),
      /cannot access/i,
    );

    await assert.rejects(
      () =>
        store.sendMessage({
          conversationId: conversation.id,
          senderUserId: BUYER.userId,
          body: "Call me at +212612345678",
        }),
      /not allowed/i,
    );

    // Reload conversation from DB (restart evidence).
    const persisted = await prisma.marketplaceMessage.count({ where: { conversationId: conversation.id } });
    assert.ok(persisted >= 2);
  });

  it("TASK5: seller presence heartbeat and expiry", async () => {
    const { sellerIsOnline, SELLER_PRESENCE_TTL_MS } = await import("../../src/lib/marketplace/presence.ts");
    const beat = await store.heartbeat(SELLER.userId);
    assert.equal(await store.isSellerOnline(SELLER.userId), true);

    // Force stale heartbeat in DB and verify offline.
    const stale = new Date(Date.now() - SELLER_PRESENCE_TTL_MS - 5_000);
    await prisma.sellerPresence.update({
      where: { sellerUserId: SELLER.userId },
      data: { lastSeenAt: stale, updatedAt: stale },
    });
    assert.equal(await store.isSellerOnline(SELLER.userId), false);
    assert.equal(sellerIsOnline({ sellerUserId: SELLER.userId, lastSeenAt: stale.toISOString(), updatedAt: stale.toISOString() }), false);

    // Seller remains discoverable via listings while offline.
    const listed = await store.listPublic({ chefProfileId: SELLER.chefProfileId });
    assert.ok(listed.items.length >= 1);
    assert.ok(listed.items.every((item) => item.sellerOnline === false || item.sellerOnline === true));
    void beat;
  });

  it("TASK6: notifications for message/follow-listing and dedupe", async () => {
    const listing = await prisma.marketplaceListing.findFirst({
      where: { sellerUserId: SELLER.userId, isPublished: true },
    });
    assert.ok(listing);
    await store.notifyFollowersOfListing({
      followerUserIds: [BUYER.userId],
      listing: {
        id: listing.id,
        chefProfileId: listing.chefProfileId,
        sellerUserId: listing.sellerUserId,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        images: listing.images,
        kind: "permanent",
        priceMode: "fixed",
        priceMad: listing.priceMad,
        availability: "available",
        isPublished: true,
        moderationStatus: "approved",
        city: listing.city,
        expiresAt: null,
        isDeleted: false,
        isActive: true,
        createdAt: listing.createdAt.toISOString(),
        updatedAt: listing.updatedAt.toISOString(),
      },
      kitchenName: "E2E Kitchen",
    });
    // Duplicate notify should not create another unread with same dedupe key within 24h.
    await store.notifyFollowersOfListing({
      followerUserIds: [BUYER.userId],
      listing: {
        id: listing.id,
        chefProfileId: listing.chefProfileId,
        sellerUserId: listing.sellerUserId,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        images: listing.images,
        kind: "permanent",
        priceMode: "fixed",
        priceMad: listing.priceMad,
        availability: "available",
        isPublished: true,
        moderationStatus: "approved",
        city: listing.city,
        expiresAt: null,
        isDeleted: false,
        isActive: true,
        createdAt: listing.createdAt.toISOString(),
        updatedAt: listing.updatedAt.toISOString(),
      },
      kitchenName: "E2E Kitchen",
    });
    const notes = await store.listNotifications(BUYER.userId);
    const listingNotes = notes.filter((n) => n.dedupeKey === `listing:${listing.id}`);
    assert.equal(listingNotes.length, 1);

    const suggestions = await store.sellerSuggestions(SELLER.userId);
    assert.ok(Array.isArray(suggestions));
  });

  it("TASK7: admin moderation and unauthorized ownership checks", async () => {
    const pending = await store.createListing({
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.userId,
      autoApprove: false,
      body: {
        title: "E2E Pending Moderation",
        description: "Listing awaiting admin moderation in isolated verification.",
        category: "home",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 33,
        availability: "available",
        city: "Fes",
        isPublished: true,
        images: [],
      },
    });
    const queue = await store.listPendingModeration();
    assert.ok(queue.some((row) => row.id === pending.id));

    const approved = await store.setListingModeration(pending.id, "approved");
    assert.equal(approved.moderationStatus, "approved");

    const report = await store.reportListing({
      listingId: pending.id,
      reporterUserId: BUYER.userId,
      reason: "E2E report for moderation queue verification.",
    });
    assert.equal(report.status, "open");
    const reports = await store.listOpenReports();
    assert.ok(reports.some((row) => row.id === report.id));

    await assert.rejects(
      () => store.updateListing(pending.id, STRANGER.userId, { title: "hack", description: "x".repeat(12), kind: "permanent", priceMode: "fixed", priceMad: 1, availability: "available", city: "x", images: [], isPublished: true }),
      /do not own/i,
    );
  });

  it("TASK9: legacy Meal/Follow/Message tables remain readable", async () => {
    const meals = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "Meal"`);
    const follows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "Follow"`);
    const messages = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "Message"`);
    assert.equal(typeof meals[0].c, "number");
    assert.equal(typeof follows[0].c, "number");
    assert.equal(typeof messages[0].c, "number");
    console.log(
      JSON.stringify({
        isolated: `${identity.host}:${identity.port}/${identity.database}`,
        mealRows: meals[0].c,
        followRows: follows[0].c,
        secureChatMessageRows: messages[0].c,
      }),
    );
  });
});
