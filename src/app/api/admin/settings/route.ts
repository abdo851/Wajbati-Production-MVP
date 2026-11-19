import { NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/audit-log";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseCommissionSettings, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-settings:${clientKey(request)}`, 10, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const settings = await getRepository(current.accessToken).updateCommissionSettings(parseCommissionSettings(await readBody(request)));
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "settings.commission",
      entityType: "platform_setting",
      entityId: "default",
      metadata: {
        chefCommissionMad: settings.chefCommissionMad,
        driverCommissionMad: settings.driverCommissionMad,
        note: "stored_setting_only_not_live_fee_until_owner_approval",
      },
    });
    return NextResponse.json({ settings });
  });
}
