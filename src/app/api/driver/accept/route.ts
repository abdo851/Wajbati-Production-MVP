import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseOrderId, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("driver");
    const { orderId } = parseOrderId(await readBody(request));
    const job = await getRepository(current.accessToken).acceptDelivery(current.user.driverId ?? "", orderId);
    return NextResponse.json(job);
  });
}
