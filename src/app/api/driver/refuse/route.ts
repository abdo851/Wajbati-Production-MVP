import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseOrderId, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("driver");
    const body = (await readBody(request)) as Record<string, unknown>;
    const { orderId } = parseOrderId(body);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 120) : "";
    const job = await getRepository(current.accessToken).advanceDelivery(
      current.user.driverId ?? "",
      orderId,
      "refuse",
      "",
      reason,
    );
    return NextResponse.json(job);
  });
}
