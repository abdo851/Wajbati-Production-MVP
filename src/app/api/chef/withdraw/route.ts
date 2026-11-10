import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function POST() {
  return handle(async () => {
    const current = await requireDesk("chef");
    await getRepository(current.accessToken).withdrawChef(current.user.id);
    return NextResponse.json({ ok: true });
  });
}
