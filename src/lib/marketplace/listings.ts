import { StoreError } from "@/lib/errors";
import type {
  ListingAvailability,
  ListingKind,
  ListingPriceMode,
  ListingWriteInput,
  MarketplaceListingRecord,
  PublicMarketplaceListing,
} from "@/lib/marketplace/types";

const KINDS: ListingKind[] = ["permanent", "temporary"];
const PRICE_MODES: ListingPriceMode[] = ["fixed", "negotiable", "hidden"];
const AVAILABILITIES: ListingAvailability[] = ["available", "preorder", "unavailable", "sold_out"];

export function parseListingWrite(body: Record<string, unknown>): ListingWriteInput {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "home";
  const kind = body.kind;
  const priceMode = body.priceMode;
  const availability = body.availability;
  if (title.length < 3 || title.length > 80) throw new StoreError("Listing title must be 3–80 characters.", 400);
  if (description.length < 10 || description.length > 800) {
    throw new StoreError("Listing description must be 10–800 characters.", 400);
  }
  if (!KINDS.includes(kind as ListingKind)) throw new StoreError("Invalid listing type.", 400);
  if (!PRICE_MODES.includes(priceMode as ListingPriceMode)) throw new StoreError("Invalid price mode.", 400);
  if (!AVAILABILITIES.includes(availability as ListingAvailability)) {
    throw new StoreError("Invalid availability.", 400);
  }

  const images = Array.isArray(body.images)
    ? body.images.filter((item): item is string => typeof item === "string" && item.startsWith("data:image/")).slice(0, 5)
    : [];

  let priceMad: number | null = null;
  if (priceMode === "fixed") {
    const raw = typeof body.priceMad === "number" ? body.priceMad : Number(body.priceMad);
    if (!Number.isFinite(raw) || raw < 1 || raw > 5000) {
      throw new StoreError("Fixed price must be between 1 and 5000 MAD.", 400);
    }
    priceMad = Math.round(raw * 2) / 2;
  } else if (body.priceMad != null && body.priceMad !== "") {
    throw new StoreError("Price value is only allowed for fixed price listings.", 400);
  }

  let expiresAt: string | null = null;
  if (kind === "temporary") {
    const raw = typeof body.expiresAt === "string" ? body.expiresAt.trim() : "";
    if (!raw || Number.isNaN(Date.parse(raw))) throw new StoreError("Temporary offers need a valid expiration.", 400);
    if (Date.parse(raw) <= Date.now()) throw new StoreError("Expiration must be in the future.", 400);
    expiresAt = new Date(raw).toISOString();
  }

  return {
    title,
    description,
    category: category.slice(0, 40),
    images,
    kind: kind as ListingKind,
    priceMode: priceMode as ListingPriceMode,
    priceMad,
    availability: availability as ListingAvailability,
    city: typeof body.city === "string" ? body.city.trim().slice(0, 60) : "",
    neighborhood: typeof body.neighborhood === "string" ? body.neighborhood.trim().slice(0, 60) : "",
    expiresAt,
    isPublished: body.isPublished === true || body.isPublished === "true",
  };
}

export function listingIsExpired(listing: MarketplaceListingRecord, now = Date.now()): boolean {
  if (listing.kind !== "temporary" || !listing.expiresAt) return false;
  return Date.parse(listing.expiresAt) <= now;
}

/** Public discovery filter — unpublished / unapproved / expired / soft-deleted excluded. */
export function listingIsPubliclyActive(listing: MarketplaceListingRecord, now = Date.now()): boolean {
  if (listing.isDeleted || !listing.isActive) return false;
  if (!listing.isPublished) return false;
  if (listing.moderationStatus !== "approved") return false;
  if (listingIsExpired(listing, now)) return false;
  return true;
}

export function toPublicListing(
  listing: MarketplaceListingRecord,
  extras?: { kitchenName?: string; sellerOnline?: boolean; sellerAcceptingInquiries?: boolean },
): PublicMarketplaceListing {
  return {
    id: listing.id,
    chefProfileId: listing.chefProfileId,
    sellerUserId: listing.sellerUserId,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    images: listing.images,
    kind: listing.kind,
    priceMode: listing.priceMode,
    priceMad: listing.priceMode === "hidden" ? null : listing.priceMad,
    availability: listing.availability,
    city: listing.city,
    neighborhood: listing.neighborhood,
    expiresAt: listing.expiresAt,
    kitchenName: extras?.kitchenName,
    sellerOnline: extras?.sellerOnline,
    sellerAcceptingInquiries: extras?.sellerAcceptingInquiries,
  };
}

export type ListingSearchQuery = {
  q?: string;
  city?: string;
  neighborhood?: string;
  category?: string;
  sellerUserId?: string;
  chefProfileId?: string;
  kind?: ListingKind;
  availability?: ListingAvailability;
  priceMode?: ListingPriceMode;
  limit?: number;
  cursor?: string;
};

export function searchListings(
  listings: MarketplaceListingRecord[],
  query: ListingSearchQuery,
  now = Date.now(),
): { items: MarketplaceListingRecord[]; nextCursor: string | null } {
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 48);
  const needle = (query.q ?? "").trim().toLowerCase();
  let filtered = listings.filter((listing) => listingIsPubliclyActive(listing, now));
  if (query.city) {
    const city = query.city.trim().toLowerCase();
    filtered = filtered.filter((item) => {
      const value = item.city.trim().toLowerCase();
      if (city === "sale" || city === "salé") return value === "sale" || value === "salé";
      return value === city;
    });
  }
  if (query.neighborhood) {
    const neighborhood = query.neighborhood.trim().toLowerCase();
    filtered = filtered.filter((item) => item.neighborhood.trim().toLowerCase() === neighborhood);
  }
  if (query.category) filtered = filtered.filter((item) => item.category === query.category);
  if (query.sellerUserId) filtered = filtered.filter((item) => item.sellerUserId === query.sellerUserId);
  if (query.chefProfileId) filtered = filtered.filter((item) => item.chefProfileId === query.chefProfileId);
  if (query.kind) filtered = filtered.filter((item) => item.kind === query.kind);
  if (query.availability) filtered = filtered.filter((item) => item.availability === query.availability);
  if (query.priceMode) filtered = filtered.filter((item) => item.priceMode === query.priceMode);
  if (needle) {
    filtered = filtered.filter((item) => {
      const hay = `${item.title} ${item.description} ${item.category} ${item.city} ${item.neighborhood}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let start = 0;
  if (query.cursor) {
    const idx = filtered.findIndex((item) => item.id === query.cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const page = filtered.slice(start, start + limit);
  const nextCursor = start + limit < filtered.length ? page[page.length - 1]?.id ?? null : null;
  return { items: page, nextCursor };
}
