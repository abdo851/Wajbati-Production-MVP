import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseOrderInput, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`order:${clientKey(request)}`, 20, 60_000))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    try {
      const input = parseOrderInput(await readBody(request));
      const order = await getRepository().placeOrder(input);
      return NextResponse.json({ order }, { status: 201 });
    } catch (error) {
      console.error("ORDER", error instanceof Error ? error.message : "unknown");
      throw error;
    }
  });
}
