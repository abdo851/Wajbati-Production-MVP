import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseCommissionSettings, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const settings = await getRepository(current.accessToken).updateCommissionSettings(parseCommissionSettings(await readBody(request)));
    return NextResponse.json({ settings });
  });
}
