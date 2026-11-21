import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-listings:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const url = new URL(request.url);
    const result = await adminMarketplaceStore.listListings({
      q: url.searchParams.get("q") || undefined,
      city: url.searchParams.get("city") || undefined,
      category: url.searchParams.get("category") || undefined,
      kind: url.searchParams.get("kind") || undefined,
      moderationStatus: url.searchParams.get("moderationStatus") || undefined,
      seller: url.searchParams.get("seller") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: Number(url.searchParams.get("limit") || 25) || 25,
    });
    return NextResponse.json(result);
  });
}
