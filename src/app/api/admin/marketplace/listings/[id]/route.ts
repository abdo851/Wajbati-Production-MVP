import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-listing:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const { id } = await context.params;
    const listing = await marketplaceStore.getListing(id);
    if (!listing) throw new StoreError("Listing not found.", 404);
    return NextResponse.json({ listing });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-listing-patch:${clientKey(request)}`, 30, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("admin");
    const { id } = await context.params;
    const body = (await readBody(request)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (action !== "approve" && action !== "reject" && action !== "hide" && action !== "restore") {
      throw new StoreError("Unknown moderation action.", 400);
    }
    const listing = await adminMarketplaceStore.moderateListing({
      listingId: id,
      action,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      actorId: current.user.id,
      actorEmail: current.user.email,
    });
    return NextResponse.json({ listing });
  });
}
