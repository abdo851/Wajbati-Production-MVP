import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    const current = await getCurrentUser();
    const viewerId = current?.user.role === "customer" ? current.user.id : null;
    const profile = await getRepository(current?.accessToken).publicChef(id, viewerId);
    return NextResponse.json({ chef: profile });
  });
}
