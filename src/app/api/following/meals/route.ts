import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer") {
      throw new StoreError("Sign in to continue.", 401);
    }
    const board = await getRepository(current.accessToken).listFollowingMeals(current.user.id);
    return NextResponse.json(board);
  });
}
