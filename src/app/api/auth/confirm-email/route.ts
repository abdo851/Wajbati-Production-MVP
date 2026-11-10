import { NextResponse } from "next/server";
import { confirmEmail } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await readBody(request)) as { token?: unknown };
    const token = String(body.token ?? "").trim();
    if (!token) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
    const ok = await confirmEmail(token);
    if (!ok) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
    return NextResponse.json({ ok: true });
  });
}
