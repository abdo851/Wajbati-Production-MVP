import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { SELLER_PRESENCE_TTL_MS, sellerIsOnline } from "@/lib/marketplace/presence";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-presence:${clientKey(request)}`, 120, 60_000, "local"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("chef");
    let acceptingInquiries: boolean | undefined;
    try {
      const body = (await request.json()) as { acceptingInquiries?: unknown };
      if (typeof body?.acceptingInquiries === "boolean") acceptingInquiries = body.acceptingInquiries;
    } catch {
      // Heartbeat-only posts may send an empty body.
    }
    const presence = await marketplaceStore.heartbeat(current.user.id, { acceptingInquiries });
    return NextResponse.json({
      presence,
      online: sellerIsOnline(presence),
      ttlMs: SELLER_PRESENCE_TTL_MS,
    });
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const sellerUserId = url.searchParams.get("sellerUserId")?.trim() || "";
    if (!sellerUserId) throw new StoreError("sellerUserId is required.", 400);
    const presence = await marketplaceStore.getSellerPresence(sellerUserId);
    const online = sellerIsOnline(presence ?? undefined);
    return NextResponse.json({
      sellerUserId,
      online,
      acceptingInquiries: presence ? presence.acceptingInquiries !== false : true,
      ttlMs: SELLER_PRESENCE_TTL_MS,
    });
  });
}
