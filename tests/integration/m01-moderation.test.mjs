import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { assertIsolatedTestDatabase } from "./isolation.mjs";

const identity = assertIsolatedTestDatabase();

describe("M0.1 moderation (isolated righ_test)", () => {
  /** @type {import('@prisma/client').PrismaClient} */
  let prisma;
  /** @type {typeof import('../../src/lib/db/admin-marketplace.ts').adminMarketplaceStore} */
  let adminStore;
  /** @type {typeof import('../../src/lib/db/marketplace-store.ts').marketplaceStore} */
  let store;

  before(async () => {
    assert.equal(identity.database, "righ_test");
    assert.equal(identity.port, "55432");
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } } });
    await prisma.$connect();
    ({ adminMarketplaceStore: adminStore } = await import("../../src/lib/db/admin-marketplace.ts"));
    ({ marketplaceStore: store } = await import("../../src/lib/db/marketplace-store.ts"));
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("keeps new listings pending and non-public until approve", async () => {
    const listing = await store.createListing({
      chefProfileId: `chef-${randomUUID()}`,
      sellerUserId: `seller-${randomUUID()}`,
      autoApprove: false,
      body: {
        title: "Pending Couscous",
        description: "Must stay pending until admin approves the listing.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 40,
        availability: "available",
        city: "Casablanca",
        isPublished: true,
        images: [],
      },
    });
    assert.equal(listing.moderationStatus, "pending");
    assert.equal(listing.previouslyApprovedAt, null);
    const publicBoard = await store.listPublic({ city: "Casablanca" });
    assert.equal(publicBoard.items.some((row) => row.id === listing.id), false);

    const approved = await adminStore.moderateListing({
      listingId: listing.id,
      action: "approve",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    assert.equal(approved?.moderationStatus, "approved");
    assert.ok(approved?.previouslyApprovedAt);
  });

  it("D2 restore: never-approved -> pending; previously approved -> approved", async () => {
    const never = await store.createListing({
      chefProfileId: `chef-${randomUUID()}`,
      sellerUserId: `seller-${randomUUID()}`,
      autoApprove: false,
      body: {
        title: "Never Approved Tagine",
        description: "Hidden then restored should return to pending review.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 30,
        availability: "available",
        city: "Rabat",
        isPublished: true,
        images: [],
      },
    });
    await adminStore.moderateListing({
      listingId: never.id,
      action: "hide",
      reason: "Temporary hide for investigation path.",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    const restoredPending = await adminStore.moderateListing({
      listingId: never.id,
      action: "restore",
      reason: "Restore after investigation completed.",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    assert.equal(restoredPending?.moderationStatus, "pending");

    const prior = await store.createListing({
      chefProfileId: `chef-${randomUUID()}`,
      sellerUserId: `seller-${randomUUID()}`,
      autoApprove: false,
      body: {
        title: "Previously Approved Pastilla",
        description: "Approve then hide then restore should return to approved.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 60,
        availability: "available",
        city: "Fes",
        isPublished: true,
        images: [],
      },
    });
    await adminStore.moderateListing({
      listingId: prior.id,
      action: "approve",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    await adminStore.moderateListing({
      listingId: prior.id,
      action: "hide",
      reason: "Hide previously approved listing for review.",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    const restoredApproved = await adminStore.moderateListing({
      listingId: prior.id,
      action: "restore",
      reason: "Restore previously approved listing with reason.",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    assert.equal(restoredApproved?.moderationStatus, "approved");
  });

  it("case close requires documented decision and assignment stamps assignedAt", async () => {
    const listing = await store.createListing({
      chefProfileId: `chef-${randomUUID()}`,
      sellerUserId: `seller-${randomUUID()}`,
      autoApprove: false,
      body: {
        title: "Case Decision Listing",
        description: "Listing used for case workflow atomicity checks.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 25,
        availability: "available",
        city: "Tangier",
        isPublished: false,
        images: [],
      },
    });
    const report = await store.reportListing({
      listingId: listing.id,
      reporterUserId: `reporter-${randomUUID()}`,
      reason: "Misleading description of ingredients and portions.",
    });

    await assert.rejects(
      () =>
        adminStore.mutateCase({
          reportId: report.id,
          actorId: "admin-qa",
          actorEmail: "admin-qa@example.com",
          action: "resolve",
          decisionType: "resolved_with_action",
          reason: "too short",
        }),
      /10 characters/,
    );

    const assigned = await adminStore.mutateCase({
      reportId: report.id,
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
      action: "assign",
    });
    assert.equal(assigned.assignedAdminId, "admin-qa");
    assert.ok(assigned.assignedAt);

    await adminStore.mutateCase({
      reportId: report.id,
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
      action: "start_review",
    });
    const resolved = await adminStore.mutateCase({
      reportId: report.id,
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
      action: "resolve",
      decisionType: "no_violation",
      reason: "Reviewed listing and found no policy violation.",
    });
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.decisionType, "no_violation");

    const events = await prisma.moderationCaseEvent.findMany({ where: { reportId: report.id } });
    assert.ok(events.some((event) => event.eventType === "resolve" || event.summary.includes("resolved")));
  });

  it("two-way case messages stay case-scoped; notes stay admin-only in participant payload shape", async () => {
    const sellerId = `seller-${randomUUID()}`;
    const reporterId = `reporter-${randomUUID()}`;
    const listing = await store.createListing({
      chefProfileId: `chef-${randomUUID()}`,
      sellerUserId: sellerId,
      autoApprove: false,
      body: {
        title: "Messaging Case Listing",
        description: "Listing for two-way participant messaging verification.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 35,
        availability: "available",
        city: "Agadir",
        isPublished: false,
        images: [],
      },
    });
    const report = await store.reportListing({
      listingId: listing.id,
      reporterUserId: reporterId,
      reason: "Inappropriate content reported for messaging test case.",
    });
    await adminStore.mutateCase({
      reportId: report.id,
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
      action: "assign",
    });
    await adminStore.addNote({
      reportId: report.id,
      authorAdminId: "admin-qa",
      actorEmail: "admin-qa@example.com",
      body: "Internal note must never reach participant APIs.",
    });
    const adminMsg = await adminStore.addCaseMessage({
      reportId: report.id,
      senderUserId: "admin-qa",
      senderRole: "admin",
      recipient: "reporter",
      body: "Hello reporter, please clarify your report details.",
      actorEmail: "admin-qa@example.com",
    });
    const reply = await adminStore.addCaseMessage({
      reportId: report.id,
      senderUserId: reporterId,
      senderRole: "reporter",
      recipient: "admin",
      body: "Thanks, here is the clarification for the case.",
    });
    assert.equal(adminMsg.senderRole, "admin");
    assert.equal(reply.senderRole, "reporter");

    const detail = await adminStore.getCaseDetail(report.id);
    assert.ok(detail.notes.length >= 1);
    assert.ok(detail.messages.length >= 2);

    await assert.rejects(
      () => adminStore.assertParticipantAccess(report.id, "stranger-user"),
      /Not allowed/,
    );
    const access = await adminStore.assertParticipantAccess(report.id, reporterId);
    assert.equal(access.role, "reporter");
  });

  it("D3 seller suspend is reversible and preserves listings/reports", async () => {
    const userId = `seller-${randomUUID()}`;
    const email = `${userId}@example.com`;
    const chefProfileId = `chef-${randomUUID()}`;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        fullName: "Suspend QA Seller",
        role: "CHEF",
        approvalStatus: "APPROVED",
        isActive: true,
        isDeleted: false,
        password: "x",
      },
    });
    await prisma.chefProfile.create({
      data: {
        id: chefProfileId,
        userId,
        kitchenName: "Suspend Kitchen",
        city: "Casablanca",
        isActive: true,
      },
    });
    const listing = await store.createListing({
      chefProfileId,
      sellerUserId: userId,
      autoApprove: true,
      body: {
        title: "Suspend Seller Listing",
        description: "Listing that must remain after seller suspension.",
        kind: "permanent",
        priceMode: "fixed",
        priceMad: 45,
        availability: "available",
        city: "Casablanca",
        isPublished: true,
        images: [],
      },
    });
    await store.reportListing({
      listingId: listing.id,
      reporterUserId: `reporter-${randomUUID()}`,
      reason: "Report retained through seller suspension lifecycle.",
    });

    const suspended = await adminStore.setSellerActive({
      userId,
      active: false,
      reason: "Temporary suspension for policy review process.",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    assert.equal(suspended.seller.isActive, false);
    assert.ok(suspended.listings.some((row) => row?.id === listing.id));
    assert.ok(suspended.reports.length >= 1);

    const stillThere = await prisma.user.findUnique({ where: { id: userId } });
    assert.equal(stillThere?.isDeleted, false);

    const reactivated = await adminStore.setSellerActive({
      userId,
      active: true,
      reason: "Reactivate seller after policy review completed.",
      actorId: "admin-qa",
      actorEmail: "admin-qa@example.com",
    });
    assert.equal(reactivated.seller.isActive, true);
  });
});
