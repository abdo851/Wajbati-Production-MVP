import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`acct-cases:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await getCurrentUser();
    if (!current) throw new StoreError("Sign in to continue.", 401);
    const cases = await adminMarketplaceStore.listParticipantCases(current.user.id);
    return NextResponse.json({ cases });
  });
}
