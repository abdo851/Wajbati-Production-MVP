import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-seller:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const { id } = await context.params;
    const detail = await adminMarketplaceStore.getSellerDetail(id);
    return NextResponse.json(detail);
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-seller-patch:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("admin");
    const { id } = await context.params;
    const body = (await readBody(request)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (action !== "suspend" && action !== "reactivate") {
      throw new StoreError("Unknown seller action.", 400);
    }
    const detail = await adminMarketplaceStore.setSellerActive({
      userId: id,
      active: action === "reactivate",
      reason,
      actorId: current.user.id,
      actorEmail: current.user.email,
    });
    return NextResponse.json(detail);
  });
}
