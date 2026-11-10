import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { issueSession, loginCustomer } from "@/lib/auth/current-user";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { registerCustomer } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { parseCustomerAccount, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const input = parseCustomerAccount(await readBody(request));
    const created = await registerCustomer(input);
    const jar = await cookies();
    if (created.accessToken) {
      jar.set(SESSION_COOKIE, issueSession(created.user.id, created.accessToken), sessionCookieOptions());
      return NextResponse.json({ user: created.user });
    }
    const signed = await loginCustomer(input.phone, input.password);
    jar.set(SESSION_COOKIE, signed.token, sessionCookieOptions());
    return NextResponse.json({ user: signed.user });
  });
}
