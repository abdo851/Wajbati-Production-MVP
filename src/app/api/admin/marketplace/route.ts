import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { recordAdminAudit } from "@/lib/audit-log";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-market:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const [pending, reports] = await Promise.all([
      marketplaceStore.listPendingModeration(),
      marketplaceStore.listOpenReports(),
    ]);
    return NextResponse.json({ pending, reports });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-market-patch:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("admin");
    const body = (await readBody(request)) as Record<string, unknown>;
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!listingId) throw new StoreError("Listing is required.", 400);
    const status =
      action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "hide" ? "hidden" : null;
    if (!status) throw new StoreError("Unknown moderation action.", 400);
    const listing = await marketplaceStore.setListingModeration(listingId, status);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "listing.moderation",
      entityType: "MarketplaceListing",
      entityId: listingId,
      metadata: { status },
    });
    return NextResponse.json({ listing });
  });
}
