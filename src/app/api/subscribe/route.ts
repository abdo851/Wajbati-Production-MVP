import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await readBody(request)) as { email?: unknown; source?: unknown };
    const email = String(body.email ?? "").trim();
    if (!EMAIL.test(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }
    const source = body.source === "company_interest" ? "company_interest" : "home_banner";
    await getRepository().addEmailCapture(email, source);
    return NextResponse.json({ ok: true });
  });
}
