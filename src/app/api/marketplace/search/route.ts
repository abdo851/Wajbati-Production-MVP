import { NextResponse } from "next/server";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import type { ListingAvailability, ListingKind, ListingPriceMode } from "@/lib/marketplace/types";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-search:${clientKey(request)}`, 60, 60_000, "local"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const url = new URL(request.url);
    const result = await marketplaceStore.listPublic({
      q: url.searchParams.get("q") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      neighborhood: url.searchParams.get("neighborhood") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      sellerUserId: url.searchParams.get("seller") ?? url.searchParams.get("sellerUserId") ?? undefined,
      chefProfileId: url.searchParams.get("chefProfileId") ?? undefined,
      kind: (url.searchParams.get("kind") as ListingKind | null) ?? undefined,
      availability: (url.searchParams.get("availability") as ListingAvailability | null) ?? undefined,
      priceMode: (url.searchParams.get("priceMode") as ListingPriceMode | null) ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number(url.searchParams.get("limit") || 24) || 24,
    });
    return NextResponse.json(result);
  });
}
