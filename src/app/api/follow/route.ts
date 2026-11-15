import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer") {
      throw new StoreError("Sign in to continue.", 401);
    }
    const body = (await readBody(request)) as Record<string, unknown>;
    const chefId = typeof body.chefId === "string" ? body.chefId.trim() : "";
    if (!chefId) throw new StoreError("That kitchen could not be found.", 400);
    const result = await getRepository(current.accessToken).followChef(current.user.id, chefId);
    return NextResponse.json(result);
  });
}
