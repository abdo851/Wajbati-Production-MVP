import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseOrderAction, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("driver");
    const input = parseOrderAction(await readBody(request));
    // OTP / advance attempts — keyed by driver identity, not whether the code is valid.
    if (input.action === "deliver") {
      const driverKey = current.user.driverId || current.user.id;
      if (!(await checkRateLimitAsync(`otp:${driverKey}:${clientKey(request)}`, 10, 60_000, "closed"))) {
        throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
      }
    }
    const job = await getRepository(current.accessToken).advanceDelivery(
      current.user.driverId ?? "",
      input.orderId,
      input.action,
      input.code,
      input.reason,
    );
    return NextResponse.json(job);
  });
}
