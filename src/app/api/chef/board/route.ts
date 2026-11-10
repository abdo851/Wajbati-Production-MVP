import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const { user, accessToken } = await requireDesk("chef");
    const board = await getRepository(accessToken).chefBoard(user.chefId as string);
    return NextResponse.json(board);
  });
}
