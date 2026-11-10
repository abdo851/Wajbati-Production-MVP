import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const { accessToken } = await requireDesk("admin");
    const overview = await getRepository(accessToken).adminOverview();
    return NextResponse.json(overview);
  });
}
