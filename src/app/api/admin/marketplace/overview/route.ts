import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-overview:${clientKey(request)}`, 30, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const overview = await adminMarketplaceStore.overview();
    return NextResponse.json(overview);
  });
}
