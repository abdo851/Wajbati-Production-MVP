import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseWalletAdjust, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const input = parseWalletAdjust(await readBody(request));
    const wallet = await getRepository(current.accessToken).adjustWallet(input.ownerId, input.amountMad);
    return NextResponse.json({ wallet });
  });
}
