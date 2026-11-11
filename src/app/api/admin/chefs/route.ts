import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseChefReview, readBody } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    const current = await requireDesk("admin");
    const chefs = await getRepository(current.accessToken).listPendingChefs();
    return NextResponse.json({ chefs });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const body = await readBody(request);
    const chefId = typeof body === "object" && body && "chefId" in body ? String(body.chefId) : "";
    if (!chefId) throw new Error("That kitchen could not be found.");
    await getRepository(current.accessToken).removeChef(chefId);
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const input = parseChefReview(await readBody(request));
    const chef = await getRepository(current.accessToken).setChefApproval(input.chefId, input.status);
    return NextResponse.json({ chef });
  });
}
