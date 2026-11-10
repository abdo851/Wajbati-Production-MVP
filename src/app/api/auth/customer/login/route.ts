import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginCustomer } from "@/lib/auth/current-user";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { handle } from "@/lib/server/http";
import { parseCustomerLogin, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const input = parseCustomerLogin(await readBody(request));
    const result = await loginCustomer(input.identifier, input.password);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return NextResponse.json({ user: result.user });
  });
}
