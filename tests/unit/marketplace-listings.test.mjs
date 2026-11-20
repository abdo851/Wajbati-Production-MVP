import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingIsExpired,
  listingIsPubliclyActive,
  parseListingWrite,
  searchListings,
} from "../../src/lib/marketplace/listings.ts";
import { sellerIsOnline, SELLER_PRESENCE_TTL_MS } from "../../src/lib/marketplace/presence.ts";
import {
  assertConversationParticipant,
  sanitizeMarketplaceMessageBody,
} from "../../src/lib/marketplace/conversations.ts";

function baseListing(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "l1",
    chefProfileId: "c1",
    sellerUserId: "s1",
    title: "Tajine test",
    description: "A homemade tajine for neighbors nearby.",
    category: "home",
    images: [],
    kind: "permanent",
    priceMode: "fixed",
    priceMad: 50,
    availability: "available",
    isPublished: true,
    moderationStatus: "approved",
    city: "Casablanca",
    neighborhood: "",
    expiresAt: null,
    isDeleted: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("marketplace listings", () => {
  it("validates fixed price and rejects price on hidden mode", () => {
    const fixed = parseListingWrite({
      title: "Couscous royal",
      description: "Friday couscous with vegetables and meat.",
      kind: "permanent",
      priceMode: "fixed",
      priceMad: 45,
      availability: "available",
      isPublished: true,
    });
    assert.equal(fixed.priceMad, 45);
    assert.throws(
      () =>
        parseListingWrite({
          title: "Couscous royal",
          description: "Friday couscous with vegetables and meat.",
          kind: "permanent",
          priceMode: "hidden",
          priceMad: 45,
          availability: "available",
        }),
      /only allowed for fixed/i,
    );
  });

  it("requires future expiration for temporary offers", () => {
    assert.throws(
      () =>
        parseListingWrite({
          title: "Pastilla offer",
          description: "Temporary weekend pastilla trays.",
          kind: "temporary",
          priceMode: "negotiable",
          availability: "available",
          expiresAt: "2000-01-01T00:00:00.000Z",
        }),
      /future/i,
    );
  });

  it("filters expired unpublished and unapproved listings from search", () => {
    const now = Date.parse("2026-11-20T12:00:00.000Z");
    const rows = [
      baseListing({ id: "ok" }),
      baseListing({ id: "exp", kind: "temporary", expiresAt: "2026-11-19T12:00:00.000Z" }),
      baseListing({ id: "draft", isPublished: false }),
      baseListing({ id: "pending", moderationStatus: "pending" }),
    ];
    assert.equal(listingIsExpired(rows[1], now), true);
    assert.equal(listingIsPubliclyActive(rows[0], now), true);
    const { items } = searchListings(rows, { city: "Casablanca" }, now);
    assert.deepEqual(
      items.map((row) => row.id),
      ["ok"],
    );
  });
});

describe("marketplace presence", () => {
  it("marks seller online only within TTL", () => {
    const now = Date.parse("2026-11-20T12:00:00.000Z");
    assert.equal(
      sellerIsOnline({ sellerUserId: "s1", lastSeenAt: new Date(now - 10_000).toISOString(), updatedAt: "" }, now),
      true,
    );
    assert.equal(
      sellerIsOnline(
        { sellerUserId: "s1", lastSeenAt: new Date(now - SELLER_PRESENCE_TTL_MS - 1).toISOString(), updatedAt: "" },
        now,
      ),
      false,
    );
  });
});

describe("marketplace conversations", () => {
  it("authorizes participants and sanitizes bodies", () => {
    const conversation = {
      id: "c1",
      buyerUserId: "b1",
      sellerUserId: "s1",
      listingId: null,
      lastMessageAt: null,
      buyerUnread: 0,
      sellerUnread: 0,
      createdAt: "",
      updatedAt: "",
    };
    assert.equal(assertConversationParticipant(conversation, "b1"), "buyer");
    assert.throws(() => assertConversationParticipant(conversation, "x"), /cannot access/i);
    assert.equal(sanitizeMarketplaceMessageBody("  hello  "), "hello");
    assert.throws(() => sanitizeMarketplaceMessageBody(""), /1–1000/);
  });
});
