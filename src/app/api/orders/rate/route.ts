import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    try {
      const body = (await readBody(request)) as Record<string, unknown>;
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const rating = Number(body.rating);
      const review = typeof body.review === "string" ? body.review : "";
      if (!token) throw new StoreError("That order could not be found.", 400);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new StoreError("That status is not recognized.", 400);
      }
      const order = await getRepository().rateOrder(token, rating, review);
      return NextResponse.json({ order });
    } catch (error) {
      console.error("RATE_ORDER", error instanceof Error ? error.message : "unknown");
      throw error;
    }
  });
}
