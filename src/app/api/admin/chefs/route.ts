import { NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/audit-log";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseChefReview, readBody } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    const current = await requireDesk("admin");
    const chefs = await getRepository(current.accessToken).listPendingChefs();
    return NextResponse.json({ chefs });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-chefs:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const body = await readBody(request);
    const chefId = typeof body === "object" && body && "chefId" in body ? String(body.chefId) : "";
    if (!chefId) throw new Error("That kitchen could not be found.");
    await getRepository(current.accessToken).removeChef(chefId);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "chef.deactivate",
      entityType: "chef",
      entityId: chefId,
      metadata: { action: "remove" },
    });
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-chefs:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const input = parseChefReview(await readBody(request));
    const chef = await getRepository(current.accessToken).setChefApproval(input.chefId, input.status);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "chef.approval",
      entityType: "chef",
      entityId: input.chefId,
      metadata: { status: input.status },
    });
    return NextResponse.json({ chef });
  });
}
