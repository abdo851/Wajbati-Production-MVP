import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-case:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const { id } = await context.params;
    const detail = await adminMarketplaceStore.getCaseDetail(id);
    return NextResponse.json(detail);
  });
}
