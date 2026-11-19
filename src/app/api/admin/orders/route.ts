import { NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/audit-log";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-orders:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const body = (await readBody(request)) as Record<string, unknown>;
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const resolution = body.resolution;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 160) : "";
    if (!orderId) throw new StoreError("That order could not be found.", 404);
    if (resolution !== "cancelled" && resolution !== "refused" && resolution !== "not_reachable") {
      throw new StoreError("That status is not recognized.", 400);
    }
    const repo = getRepository(current.accessToken);
    if (!("adminResolveOrder" in repo) || typeof repo.adminResolveOrder !== "function") {
      throw new StoreError("Order resolution is not available in this data mode.", 501);
    }
    const result = await repo.adminResolveOrder(orderId, resolution, reason);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "order.admin_resolve",
      entityType: "order",
      entityId: orderId,
      metadata: { resolution, reason: reason || null, status: result.status },
    });
    return NextResponse.json(result);
  });
}
