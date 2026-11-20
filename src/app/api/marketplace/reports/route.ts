import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-report:${clientKey(request)}`, 10, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer") {
      throw new StoreError("Sign in as a customer to report a listing.", 401);
    }
    const body = (await readBody(request)) as Record<string, unknown>;
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (!listingId) throw new StoreError("Listing is required.", 400);
    const report = await marketplaceStore.reportListing({
      listingId,
      reporterUserId: current.user.id,
      reason,
    });
    return NextResponse.json({ report }, { status: 201 });
  });
}
