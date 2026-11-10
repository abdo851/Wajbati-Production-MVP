import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { freshExpiry, openSession, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { dataProvider } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    const jar = await cookies();
    const existing = openSession(jar.get(SESSION_COOKIE)?.value);
    if (current && existing) {
      jar.set(SESSION_COOKIE, sealSession({ ...existing, exp: freshExpiry() }), sessionCookieOptions());
    }
    return NextResponse.json({
      user: current?.user ?? null,
      provider: dataProvider(),
    });
  });
}
