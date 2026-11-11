import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseDriverReview, readBody } from "@/lib/validators";

export async function DELETE(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const body = await readBody(request);
    const driverId = typeof body === "object" && body && "driverId" in body ? String(body.driverId) : "";
    if (!driverId) throw new Error("That driver could not be found.");
    await getRepository(current.accessToken).removeDriver(driverId);
    return NextResponse.json({ ok: true });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const input = parseDriverReview(await readBody(request));
    const driver = await getRepository(current.accessToken).setDriverStatus(input.driverId, input.status);
    return NextResponse.json(driver);
  });
}
