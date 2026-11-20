/**
 * Marketplace persistence — Prisma/PostgreSQL only.
 *
 * Local/dev: RIGH_TEST_DATABASE_URL (localhost isolated DB).
 * Vercel: CUSTOM_DATABASE_URL after marketplace migration is applied.
 * Never uses data/marketplace-store.json as operational storage.
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import type {
  ListingAvailability as PrismaAvailability,
  ListingKind as PrismaKind,
  ListingModerationStatus as PrismaModeration,
  ListingPriceMode as PrismaPriceMode,
  MarketplaceListing as PrismaListing,
  MarketplaceConversation as PrismaConversation,
  MarketplaceMessage as PrismaMessage,
  SellerPresence as PrismaPresence,
  AppNotification as PrismaNotification,
  ListingReport as PrismaReport,
} from "@prisma/client";
import { messageSharesContact } from "@/lib/contact-guard";
import { getMarketplacePrisma } from "@/lib/db/marketplace-prisma-client";
import { StoreError } from "@/lib/errors";
import {
  assertConversationParticipant,
  sanitizeMarketplaceMessageBody,
  sortMessages,
} from "@/lib/marketplace/conversations";
import { listingIsPubliclyActive, parseListingWrite, searchListings, toPublicListing } from "@/lib/marketplace/listings";
import { SELLER_PRESENCE_TTL_MS, sellerIsOnline } from "@/lib/marketplace/presence";
import type {
  AppNotificationRecord,
  ListingAvailability,
  ListingKind,
  ListingModerationStatus,
  ListingPriceMode,
  ListingReportRecord,
  ListingWriteInput,
  MarketplaceConversationRecord,
  MarketplaceListingRecord,
  MarketplaceMessageRecord,
  MarketplaceStoreData,
  PublicMarketplaceListing,
  SellerPresenceRecord,
} from "@/lib/marketplace/types";

const legacyJsonPath = path.join(process.cwd(), "data", "marketplace-store.json");
let legacyImportAttempted = false;

function kindOut(value: PrismaKind): ListingKind {
  return value === "TEMPORARY" ? "temporary" : "permanent";
}
function kindIn(value: ListingKind): PrismaKind {
  return value === "temporary" ? "TEMPORARY" : "PERMANENT";
}
function priceOut(value: PrismaPriceMode): ListingPriceMode {
  if (value === "NEGOTIABLE") return "negotiable";
  if (value === "HIDDEN") return "hidden";
  return "fixed";
}
function priceIn(value: ListingPriceMode): PrismaPriceMode {
  if (value === "negotiable") return "NEGOTIABLE";
  if (value === "hidden") return "HIDDEN";
  return "FIXED";
}
function availOut(value: PrismaAvailability): ListingAvailability {
  if (value === "PREORDER") return "preorder";
  if (value === "UNAVAILABLE") return "unavailable";
  if (value === "SOLD_OUT") return "sold_out";
  return "available";
}
function availIn(value: ListingAvailability): PrismaAvailability {
  if (value === "preorder") return "PREORDER";
  if (value === "unavailable") return "UNAVAILABLE";
  if (value === "sold_out") return "SOLD_OUT";
  return "AVAILABLE";
}
function modOut(value: PrismaModeration): ListingModerationStatus {
  if (value === "APPROVED") return "approved";
  if (value === "REJECTED") return "rejected";
  if (value === "HIDDEN") return "hidden";
  return "pending";
}
function modIn(value: ListingModerationStatus): PrismaModeration {
  if (value === "approved") return "APPROVED";
  if (value === "rejected") return "REJECTED";
  if (value === "hidden") return "HIDDEN";
  return "PENDING";
}

function mapListing(row: PrismaListing): MarketplaceListingRecord {
  return {
    id: row.id,
    chefProfileId: row.chefProfileId,
    sellerUserId: row.sellerUserId,
    title: row.title,
    description: row.description,
    category: row.category,
    images: row.images ?? [],
    kind: kindOut(row.kind),
    priceMode: priceOut(row.priceMode),
    priceMad: row.priceMad,
    availability: availOut(row.availability),
    isPublished: row.isPublished,
    moderationStatus: modOut(row.moderationStatus),
    city: row.city,
    neighborhood: row.neighborhood ?? "",
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isDeleted: row.isDeleted,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapConversation(row: PrismaConversation): MarketplaceConversationRecord {
  return {
    id: row.id,
    buyerUserId: row.buyerUserId,
    sellerUserId: row.sellerUserId,
    listingId: row.listingId,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    buyerUnread: row.buyerUnread,
    sellerUnread: row.sellerUnread,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMessage(row: PrismaMessage): MarketplaceMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderUserId: row.senderUserId,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPresence(row: PrismaPresence): SellerPresenceRecord {
  return {
    sellerUserId: row.sellerUserId,
    lastSeenAt: row.lastSeenAt.toISOString(),
    acceptingInquiries: row.acceptingInquiries !== false,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapNotification(row: PrismaNotification): AppNotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapReport(row: PrismaReport): ListingReportRecord {
  const status = row.status === "resolved" || row.status === "dismissed" ? row.status : "open";
  return {
    id: row.id,
    listingId: row.listingId,
    reporterUserId: row.reporterUserId,
    reason: row.reason,
    status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * One-time import of Phase 2 JSON fixture data into isolated Postgres.
 * - Skipped on Vercel/production.
 * - Never deletes or rewrites the JSON file.
 * - Idempotent: skips when listings already exist, and skips individual rows by id.
 */
async function importLegacyJsonOnce(): Promise<void> {
  if (legacyImportAttempted) return;
  legacyImportAttempted = true;
  if (process.env.VERCEL === "1") return;
  if (!existsSync(legacyJsonPath)) return;
  try {
    const raw = JSON.parse(readFileSync(legacyJsonPath, "utf8")) as MarketplaceStoreData;
    const db = getMarketplacePrisma();
    const existing = await db.marketplaceListing.count();
    if (existing > 0) return;
    for (const listing of raw.listings ?? []) {
      const already = await db.marketplaceListing.findUnique({ where: { id: listing.id } });
      if (already) continue;
      await db.marketplaceListing.create({
        data: {
          id: listing.id,
          chefProfileId: listing.chefProfileId,
          sellerUserId: listing.sellerUserId,
          title: listing.title,
          description: listing.description,
          category: listing.category,
          images: listing.images ?? [],
          kind: kindIn(listing.kind),
          priceMode: priceIn(listing.priceMode),
          priceMad: listing.priceMad,
          availability: availIn(listing.availability),
          isPublished: listing.isPublished,
          moderationStatus: modIn(listing.moderationStatus),
          city: listing.city,
          expiresAt: listing.expiresAt ? new Date(listing.expiresAt) : null,
          isDeleted: listing.isDeleted,
          isActive: listing.isActive,
          createdAt: new Date(listing.createdAt),
          updatedAt: new Date(listing.updatedAt),
        },
      });
    }
  } catch {
    // Best-effort import only — do not block marketplace if JSON is corrupt.
  }
}

async function db() {
  await importLegacyJsonOnce();
  return getMarketplacePrisma();
}

async function pushNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  dedupeKey: string | null;
}) {
  const prisma = await db();
  if (input.dedupeKey) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.appNotification.findFirst({
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        createdAt: { gt: dayAgo },
      },
    });
    if (recent) return;
  }
  try {
    await prisma.appNotification.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        dedupeKey: input.dedupeKey,
      },
    });
  } catch {
    // Unique dedupe race — ignore
  }
}

export const marketplaceStore = {
  async listPublic(query: Parameters<typeof searchListings>[1]): Promise<{
    items: PublicMarketplaceListing[];
    nextCursor: string | null;
  }> {
    const prisma = await db();
    const rows = await prisma.marketplaceListing.findMany({
      where: { isDeleted: false, isActive: true, isPublished: true, moderationStatus: "APPROVED" },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    const mapped = rows.map(mapListing);
    const presenceRows = await prisma.sellerPresence.findMany({
      where: { sellerUserId: { in: [...new Set(mapped.map((row) => row.sellerUserId))] } },
    });
    const presenceBySeller = new Map(presenceRows.map((row) => [row.sellerUserId, mapPresence(row)]));
    const { items, nextCursor } = searchListings(mapped, query);
    return {
      nextCursor,
      items: items.map((listing) => {
        const presence = presenceBySeller.get(listing.sellerUserId);
        return toPublicListing(listing, {
          sellerOnline: sellerIsOnline(presence),
          sellerAcceptingInquiries: presence ? presence.acceptingInquiries !== false : true,
        });
      }),
    };
  },

  async listForChef(chefProfileId: string, includeUnpublished: boolean): Promise<MarketplaceListingRecord[]> {
    const prisma = await db();
    const rows = await prisma.marketplaceListing.findMany({
      where: {
        chefProfileId,
        isDeleted: false,
        ...(includeUnpublished
          ? {}
          : { isPublished: true, moderationStatus: "APPROVED", isActive: true }),
      },
      orderBy: { updatedAt: "desc" },
    });
    const mapped = rows.map(mapListing);
    return includeUnpublished ? mapped : mapped.filter((row) => listingIsPubliclyActive(row));
  },

  async getListing(id: string): Promise<MarketplaceListingRecord | null> {
    const prisma = await db();
    const row = await prisma.marketplaceListing.findFirst({ where: { id, isDeleted: false } });
    return row ? mapListing(row) : null;
  },

  async createListing(input: {
    chefProfileId: string;
    sellerUserId: string;
    body: Record<string, unknown>;
    autoApprove?: boolean;
  }): Promise<MarketplaceListingRecord> {
    const parsed = parseListingWrite(input.body);
    const prisma = await db();
    const now = new Date();
    const row = await prisma.marketplaceListing.create({
      data: {
        id: randomUUID(),
        chefProfileId: input.chefProfileId,
        sellerUserId: input.sellerUserId,
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        images: parsed.images,
        kind: kindIn(parsed.kind),
        priceMode: priceIn(parsed.priceMode),
        priceMad: parsed.priceMad,
        availability: availIn(parsed.availability),
        isPublished: parsed.isPublished,
        moderationStatus: input.autoApprove ? "APPROVED" : "PENDING",
        city: parsed.city,
        neighborhood: parsed.neighborhood,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        isDeleted: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    return mapListing(row);
  },

  async updateListing(
    listingId: string,
    sellerUserId: string,
    body: Record<string, unknown>,
  ): Promise<MarketplaceListingRecord> {
    const prisma = await db();
    const existing = await prisma.marketplaceListing.findFirst({ where: { id: listingId, isDeleted: false } });
    if (!existing) throw new StoreError("Listing not found.", 404);
    if (existing.sellerUserId !== sellerUserId) throw new StoreError("You do not own this listing.", 403);
    const current = mapListing(existing);
    const parsed = parseListingWrite({
      title: body.title ?? current.title,
      description: body.description ?? current.description,
      category: body.category ?? current.category,
      images: body.images ?? current.images,
      kind: body.kind ?? current.kind,
      priceMode: body.priceMode ?? current.priceMode,
      priceMad: body.priceMad !== undefined ? body.priceMad : current.priceMad,
      availability: body.availability ?? current.availability,
      city: body.city ?? current.city,
      neighborhood: body.neighborhood ?? current.neighborhood,
      expiresAt: body.expiresAt !== undefined ? body.expiresAt : current.expiresAt,
      isPublished: body.isPublished !== undefined ? body.isPublished : current.isPublished,
    });
    const row = await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: {
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        images: parsed.images,
        kind: kindIn(parsed.kind),
        priceMode: priceIn(parsed.priceMode),
        priceMad: parsed.priceMad,
        availability: availIn(parsed.availability),
        city: parsed.city,
        neighborhood: parsed.neighborhood,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        isPublished: parsed.isPublished,
        updatedAt: new Date(),
      },
    });
    return mapListing(row);
  },

  async softDeleteListing(listingId: string, sellerUserId: string): Promise<void> {
    const prisma = await db();
    const existing = await prisma.marketplaceListing.findFirst({ where: { id: listingId, isDeleted: false } });
    if (!existing) throw new StoreError("Listing not found.", 404);
    if (existing.sellerUserId !== sellerUserId) throw new StoreError("You do not own this listing.", 403);
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { isDeleted: true, isPublished: false, updatedAt: new Date() },
    });
  },

  async setListingModeration(
    listingId: string,
    moderationStatus: MarketplaceListingRecord["moderationStatus"],
  ): Promise<MarketplaceListingRecord> {
    const prisma = await db();
    const existing = await prisma.marketplaceListing.findFirst({ where: { id: listingId, isDeleted: false } });
    if (!existing) throw new StoreError("Listing not found.", 404);
    const row = await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { moderationStatus: modIn(moderationStatus), updatedAt: new Date() },
    });
    return mapListing(row);
  },

  async reportListing(input: {
    listingId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<ListingReportRecord> {
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 500) throw new StoreError("Report reason must be 5–500 characters.", 400);
    const prisma = await db();
    const listing = await prisma.marketplaceListing.findFirst({ where: { id: input.listingId, isDeleted: false } });
    if (!listing) throw new StoreError("Listing not found.", 404);
    const row = await prisma.listingReport.create({
      data: {
        id: randomUUID(),
        listingId: input.listingId,
        reporterUserId: input.reporterUserId,
        reason,
        status: "open",
      },
    });
    return mapReport(row);
  },

  async listOpenReports(): Promise<ListingReportRecord[]> {
    const prisma = await db();
    const rows = await prisma.listingReport.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } });
    return rows.map(mapReport);
  },

  async listPendingModeration(): Promise<MarketplaceListingRecord[]> {
    const prisma = await db();
    const rows = await prisma.marketplaceListing.findMany({
      where: { isDeleted: false, moderationStatus: "PENDING", isPublished: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(mapListing);
  },

  async heartbeat(
    sellerUserId: string,
    options?: { acceptingInquiries?: boolean },
  ): Promise<SellerPresenceRecord> {
    const prisma = await db();
    const now = new Date();
    const accepting =
      typeof options?.acceptingInquiries === "boolean" ? options.acceptingInquiries : undefined;
    const row = await prisma.sellerPresence.upsert({
      where: { sellerUserId },
      create: {
        sellerUserId,
        lastSeenAt: now,
        acceptingInquiries: accepting ?? true,
        updatedAt: now,
      },
      update: {
        lastSeenAt: now,
        updatedAt: now,
        ...(accepting === undefined ? {} : { acceptingInquiries: accepting }),
      },
    });
    return mapPresence(row);
  },

  async isSellerOnline(sellerUserId: string): Promise<boolean> {
    const prisma = await db();
    const row = await prisma.sellerPresence.findUnique({ where: { sellerUserId } });
    return sellerIsOnline(row ? mapPresence(row) : undefined);
  },

  async getSellerPresence(sellerUserId: string): Promise<SellerPresenceRecord | null> {
    const prisma = await db();
    const row = await prisma.sellerPresence.findUnique({ where: { sellerUserId } });
    return row ? mapPresence(row) : null;
  },

  async openOrCreateConversation(input: {
    buyerUserId: string;
    sellerUserId: string;
    listingId?: string | null;
  }): Promise<MarketplaceConversationRecord> {
    if (input.buyerUserId === input.sellerUserId) {
      throw new StoreError("You cannot message yourself.", 400);
    }
    const prisma = await db();
    const existing = await prisma.marketplaceConversation.findUnique({
      where: {
        buyerUserId_sellerUserId: {
          buyerUserId: input.buyerUserId,
          sellerUserId: input.sellerUserId,
        },
      },
    });
    if (existing) {
      if (input.listingId && !existing.listingId) {
        const updated = await prisma.marketplaceConversation.update({
          where: { id: existing.id },
          data: { listingId: input.listingId, updatedAt: new Date() },
        });
        return mapConversation(updated);
      }
      return mapConversation(existing);
    }
    const now = new Date();
    const created = await prisma.marketplaceConversation.create({
      data: {
        id: randomUUID(),
        buyerUserId: input.buyerUserId,
        sellerUserId: input.sellerUserId,
        listingId: input.listingId ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return mapConversation(created);
  },

  async listConversationsFor(userId: string): Promise<MarketplaceConversationRecord[]> {
    const prisma = await db();
    const rows = await prisma.marketplaceConversation.findMany({
      where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(mapConversation);
  },

  async getConversation(id: string, userId: string): Promise<{
    conversation: MarketplaceConversationRecord;
    messages: MarketplaceMessageRecord[];
  }> {
    const prisma = await db();
    const conversation = await prisma.marketplaceConversation.findUnique({ where: { id } });
    if (!conversation) throw new StoreError("Conversation not found.", 404);
    assertConversationParticipant(mapConversation(conversation), userId);
    const messages = await prisma.marketplaceMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
    });
    return {
      conversation: mapConversation(conversation),
      messages: sortMessages(messages.map(mapMessage)),
    };
  },

  async sendMessage(input: {
    conversationId: string;
    senderUserId: string;
    body: string;
  }): Promise<{ conversation: MarketplaceConversationRecord; message: MarketplaceMessageRecord }> {
    const body = sanitizeMarketplaceMessageBody(input.body);
    if (messageSharesContact(body)) {
      throw new StoreError("Phone numbers, emails, and links are not allowed in chat.", 400);
    }
    const prisma = await db();
    const conversation = await prisma.marketplaceConversation.findUnique({ where: { id: input.conversationId } });
    if (!conversation) throw new StoreError("Conversation not found.", 404);
    const role = assertConversationParticipant(mapConversation(conversation), input.senderUserId);
    const now = new Date();
    const message = await prisma.marketplaceMessage.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        senderUserId: input.senderUserId,
        body,
        createdAt: now,
      },
    });
    const updated = await prisma.marketplaceConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        updatedAt: now,
        buyerUnread: role === "seller" ? { increment: 1 } : undefined,
        sellerUnread: role === "buyer" ? { increment: 1 } : undefined,
      },
    });
    const recipientId = role === "buyer" ? conversation.sellerUserId : conversation.buyerUserId;
    await pushNotification({
      userId: recipientId,
      kind: "marketplace.message",
      title: "New marketplace message",
      body: body.slice(0, 120),
      href: "/messages",
      dedupeKey: `msg:${conversation.id}:${Math.floor(Date.now() / (5 * 60 * 1000))}`,
    });
    return { conversation: mapConversation(updated), message: mapMessage(message) };
  },

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    const prisma = await db();
    const conversation = await prisma.marketplaceConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new StoreError("Conversation not found.", 404);
    const role = assertConversationParticipant(mapConversation(conversation), userId);
    const now = new Date();
    await prisma.marketplaceConversation.update({
      where: { id: conversationId },
      data: {
        buyerUnread: role === "buyer" ? 0 : undefined,
        sellerUnread: role === "seller" ? 0 : undefined,
        updatedAt: now,
      },
    });
    await prisma.marketplaceMessage.updateMany({
      where: {
        conversationId,
        senderUserId: { not: userId },
        readAt: null,
      },
      data: { readAt: now },
    });
  },

  async listNotifications(userId: string): Promise<AppNotificationRecord[]> {
    const prisma = await db();
    const rows = await prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapNotification);
  },

  async notifyFollowersOfListing(input: {
    followerUserIds: string[];
    listing: MarketplaceListingRecord;
    kitchenName: string;
  }): Promise<void> {
    for (const userId of input.followerUserIds) {
      await pushNotification({
        userId,
        kind: "marketplace.followed_listing",
        title: input.kitchenName,
        body: `New listing: ${input.listing.title}`,
        href: `/chef/${input.listing.chefProfileId}`,
        dedupeKey: `listing:${input.listing.id}`,
      });
    }
  },

  async sellerSuggestions(sellerUserId: string): Promise<AppNotificationRecord[]> {
    const prisma = await db();
    const mine = await prisma.marketplaceListing.findMany({
      where: { sellerUserId, isDeleted: false },
      take: 50,
    });
    const now = new Date().toISOString();
    const suggestions: AppNotificationRecord[] = [];
    if (mine.length === 0) {
      suggestions.push({
        id: "suggest-publish",
        userId: sellerUserId,
        kind: "seller.suggestion",
        title: "Publish a dish",
        body: "Share a permanent listing or a temporary offer with your storefront.",
        href: "/chef",
        dedupeKey: "suggest:publish",
        readAt: null,
        createdAt: now,
      });
    }
    const stale = mine.find((row) => row.availability === "UNAVAILABLE" || row.availability === "SOLD_OUT");
    if (stale) {
      suggestions.push({
        id: "suggest-availability",
        userId: sellerUserId,
        kind: "seller.suggestion",
        title: "Update availability",
        body: `“${stale.title}” may need an availability refresh.`,
        href: "/chef",
        dedupeKey: `suggest:avail:${stale.id}`,
        readAt: null,
        createdAt: now,
      });
    }
    return suggestions;
  },

  presenceTtlMs: SELLER_PRESENCE_TTL_MS,
};

export type { ListingWriteInput };
