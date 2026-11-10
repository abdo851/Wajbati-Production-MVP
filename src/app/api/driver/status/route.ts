import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseOrderAction, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("driver");
    const input = parseOrderAction(await readBody(request));
    const job = await getRepository(current.accessToken).advanceDelivery(
      current.user.driverId ?? "",
      input.orderId,
      input.action,
      input.code,
    );
    return NextResponse.json(job);
  });
}
