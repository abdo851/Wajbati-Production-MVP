import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseOrderEmail, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const input = parseOrderEmail(await readBody(request));
    await getRepository().attachOrderEmail(input.orderId, input.email);
    return NextResponse.json({ ok: true });
  });
}
