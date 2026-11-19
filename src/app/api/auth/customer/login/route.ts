import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginCustomer } from "@/lib/auth/current-user";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { parseCustomerLogin, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`customer-login:${clientKey(request)}`, 5, 60_000, "closed"))) {
      throw new StoreError("محاولات كثيرة، حاول بعد دقيقة.", 429);
    }
    const input = parseCustomerLogin(await readBody(request));
    const result = await loginCustomer(input.identifier, input.password);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return NextResponse.json({ user: result.user });
  });
}
