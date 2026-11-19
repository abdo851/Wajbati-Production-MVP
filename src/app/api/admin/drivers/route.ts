import { NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/audit-log";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseDriverReview, readBody } from "@/lib/validators";

export async function DELETE(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-drivers:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const body = await readBody(request);
    const driverId = typeof body === "object" && body && "driverId" in body ? String(body.driverId) : "";
    if (!driverId) throw new Error("That driver could not be found.");
    await getRepository(current.accessToken).removeDriver(driverId);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "driver.deactivate",
      entityType: "driver",
      entityId: driverId,
      metadata: { action: "remove" },
    });
    return NextResponse.json({ ok: true });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-drivers:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const input = parseDriverReview(await readBody(request));
    const driver = await getRepository(current.accessToken).setDriverStatus(input.driverId, input.status);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "driver.approval",
      entityType: "driver",
      entityId: input.driverId,
      metadata: { status: input.status },
    });
    return NextResponse.json(driver);
  });
}
