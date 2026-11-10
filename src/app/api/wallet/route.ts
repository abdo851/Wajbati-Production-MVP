import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || (current.user.role !== "chef" && current.user.role !== "driver")) {
      throw new StoreError("Sign in to continue.", 401);
    }
    const wallet = await getRepository(current.accessToken).walletView(current.user.id);
    return NextResponse.json({ wallet });
  });
}
