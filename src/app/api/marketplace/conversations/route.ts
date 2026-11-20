import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { unreadFor } from "@/lib/marketplace/conversations";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function GET(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || (current.user.role !== "customer" && current.user.role !== "chef")) {
      throw new StoreError("Sign in to continue.", 401);
    }
    const conversations = await marketplaceStore.listConversationsFor(current.user.id);
    return NextResponse.json({
      conversations: conversations.map((row) => ({
        ...row,
        unread: unreadFor(row, current.user.id),
      })),
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-conv-open:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer") {
      throw new StoreError("Sign in as a customer to message a seller.", 401);
    }
    const body = (await readBody(request)) as Record<string, unknown>;
    const sellerUserId = typeof body.sellerUserId === "string" ? body.sellerUserId.trim() : "";
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : null;
    if (!sellerUserId) throw new StoreError("Seller is required.", 400);

    if (listingId) {
      const listing = await marketplaceStore.getListing(listingId);
      if (!listing || listing.sellerUserId !== sellerUserId) {
        throw new StoreError("Listing not found.", 404);
      }
    }

    const conversation = await marketplaceStore.openOrCreateConversation({
      buyerUserId: current.user.id,
      sellerUserId,
      listingId,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  });
}
