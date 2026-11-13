import { NextResponse } from "next/server";
import { login } from "@/lib/auth/current-user";
import { SESSION_COOKIE, sessionCookieOptions, warnIfSessionSecretMissing } from "@/lib/auth/session";
import { LoginFailure } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseLogin, readBody } from "@/lib/validators";

function failureReason(error: unknown) {
  if (error instanceof LoginFailure) return error.reason;
  if (error instanceof Error && error.message.includes("WAJBATI_SESSION_SECRET")) return "session error";
  if (error instanceof Error && error.message) return error.message;
  return "session error";
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = parseLogin(await readBody(request));
    console.error("LOGIN ATTEMPT", input.email);
    warnIfSessionSecretMissing();
    try {
      const result = await login(input.email, input.password, input.desk);
      const response = NextResponse.json({ user: result.user });
      response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
      return response;
    } catch (error) {
      console.error("LOGIN ATTEMPT", input.email, failureReason(error));
      throw error;
    }
  });
}
