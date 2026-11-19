import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`track:${clientKey(request)}`, 60, 60_000))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
      throw new StoreError("That order could not be found.", 404);
    }
    const order = await getRepository().trackOrder(token);
    return NextResponse.json({ order });
  });
}
