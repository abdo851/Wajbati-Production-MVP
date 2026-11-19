import { NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/audit-log";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseWalletAdjust, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-wallets:${clientKey(request)}`, 10, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const current = await requireDesk("admin");
    const input = parseWalletAdjust(await readBody(request));
    const wallet = await getRepository(current.accessToken).adjustWallet(input.ownerId, input.amountMad);
    await recordAdminAudit({
      actorId: current.user.id,
      actorEmail: current.user.email,
      action: "wallet.adjust",
      entityType: "wallet",
      entityId: input.ownerId,
      metadata: { amountMad: input.amountMad, balanceMad: wallet.balanceMad },
    });
    return NextResponse.json({ wallet });
  });
}
