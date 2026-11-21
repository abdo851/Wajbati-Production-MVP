import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`acct-case:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await getCurrentUser();
    if (!current) throw new StoreError("Sign in to continue.", 401);
    const { id } = await context.params;
    const access = await adminMarketplaceStore.assertParticipantAccess(id, current.user.id);
    const detail = await adminMarketplaceStore.getCaseDetail(id);
    // D1: never expose internal notes to participants
    return NextResponse.json({
      case: detail.case,
      listing: detail.listing
        ? {
            id: detail.listing.id,
            title: detail.listing.title,
            city: detail.listing.city,
            moderationStatus: detail.listing.moderationStatus,
          }
        : null,
      role: access.role,
      messages: detail.messages,
      events: detail.events.filter((event) => event.eventType === "message" || event.eventType === "status"),
      evidence: detail.evidence,
    });
  });
}
