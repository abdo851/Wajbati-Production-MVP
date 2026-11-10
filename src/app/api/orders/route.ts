import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseOrderInput, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const input = parseOrderInput(await readBody(request));
    const order = await getRepository().placeOrder(input);
    return NextResponse.json({ order }, { status: 201 });
  });
}
