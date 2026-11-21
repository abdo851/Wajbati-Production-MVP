import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-cases:${clientKey(request)}`, 40, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    await requireDesk("admin");
    const url = new URL(request.url);
    const result = await adminMarketplaceStore.listCases({
      status: url.searchParams.get("status") || undefined,
      priority: url.searchParams.get("priority") || undefined,
      category: url.searchParams.get("category") || undefined,
      q: url.searchParams.get("q") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: Number(url.searchParams.get("limit") || 25) || 25,
    });
    return NextResponse.json(result);
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-cases-patch:${clientKey(request)}`, 30, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("admin");
    const body = (await readBody(request)) as Record<string, unknown>;
    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!reportId || !action) throw new StoreError("Case and action are required.", 400);
    const report = await adminMarketplaceStore.mutateCase({
      reportId,
      actorId: current.user.id,
      actorEmail: current.user.email,
      action,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      decisionType: typeof body.decisionType === "string" ? body.decisionType : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      assignedAdminId:
        body.assignedAdminId === null
          ? null
          : typeof body.assignedAdminId === "string"
            ? body.assignedAdminId
            : undefined,
    });
    return NextResponse.json({ case: report });
  });
}
