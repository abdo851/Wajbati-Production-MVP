import { NextResponse } from "next/server";
import { getCurrentUser, requireDesk } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { listingIsPubliclyActive, toPublicListing } from "@/lib/marketplace/listings";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const listing = await marketplaceStore.getListing(id);
    if (!listing) throw new StoreError("Listing not found.", 404);
    const current = await getCurrentUser();
    const isOwner = current?.user.id === listing.sellerUserId;
    if (!isOwner && !listingIsPubliclyActive(listing)) throw new StoreError("Listing not found.", 404);
    const online = await marketplaceStore.isSellerOnline(listing.sellerUserId);
    return NextResponse.json({
      listing: isOwner ? listing : toPublicListing(listing, { sellerOnline: online }),
    });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-listings-patch:${clientKey(request)}`, 30, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("chef");
    const { id } = await params;
    const body = (await readBody(request)) as Record<string, unknown>;
    const listing = await marketplaceStore.updateListing(id, current.user.id, body);
    return NextResponse.json({ listing });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-listings-del:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("chef");
    const { id } = await params;
    await marketplaceStore.softDeleteListing(id, current.user.id);
    return NextResponse.json({ ok: true });
  });
}
