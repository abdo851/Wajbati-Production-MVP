import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await requireDesk("admin");
    const users = await getRepository(current.accessToken).listStaff();
    return NextResponse.json({ users });
  });
}
