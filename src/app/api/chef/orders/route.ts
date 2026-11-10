import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseStatusUpdate, readBody } from "@/lib/validators";

export async function PATCH(request: Request) {
  return handle(async () => {
    const { user, accessToken } = await requireDesk("chef");
    const input = parseStatusUpdate(await readBody(request));
    const order = await getRepository(accessToken).updateOrderStatus(
      user.chefId as string,
      input.orderId,
      input.status,
    );
    return NextResponse.json({ order });
  });
}
