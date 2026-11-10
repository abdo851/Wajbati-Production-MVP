import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { issueSession } from "@/lib/auth/current-user";
import {
  exchangeGoogleCode,
  GOOGLE_PENDING_COOKIE,
  googleDesk,
  OAUTH_STATE_COOKIE,
  pendingCookieOptions,
  sealGooglePending,
} from "@/lib/auth/google";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { dataProvider, findGoogleAccount, registerGoogleCustomer } from "@/lib/db";
import { signInSupabaseGoogle } from "@/lib/db/supabase-store";
import type { AuthUser } from "@/lib/types";
import { handle } from "@/lib/server/http";

function homeFor(role: AuthUser["role"]): string {
  if (role === "chef") return "/chef";
  if (role === "driver") return "/driver/dashboard";
  if (role === "admin") return "/";
  return "/";
}

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const jar = await cookies();
    const state = url.searchParams.get("state") ?? "";
    const expected = jar.get(OAUTH_STATE_COOKIE)?.value ?? "";
    jar.delete(OAUTH_STATE_COOKIE);
    if (!state || state !== expected) {
      return NextResponse.redirect(new URL("/?google=failed", url.origin));
    }
    const desk = googleDesk(state.split(".")[0] ?? null);
    const code = url.searchParams.get("code");
    if (!code) return NextResponse.redirect(new URL(`${desk === "customer" ? "/account" : desk === "chef" ? "/chef" : "/driver"}?google=failed`, url.origin));
    const { identity, idToken } = await exchangeGoogleCode(url.origin, code);

    if (dataProvider() === "supabase" && idToken) {
      const signed = await signInSupabaseGoogle(idToken);
      if (signed) {
        jar.set(SESSION_COOKIE, issueSession(signed.user.id, signed.accessToken), sessionCookieOptions());
        if (signed.user.role === "customer" && desk !== "customer") {
          jar.set(GOOGLE_PENDING_COOKIE, sealGooglePending(identity, desk), pendingCookieOptions());
          const next = desk === "chef" ? "/chef?google=finish" : "/driver?google=finish";
          return NextResponse.redirect(new URL(next, url.origin));
        }
        return NextResponse.redirect(new URL(homeFor(signed.user.role), url.origin));
      }
    }

    const existing = await findGoogleAccount(identity);
    if (existing) {
      jar.set(SESSION_COOKIE, issueSession(existing.id), sessionCookieOptions());
      return NextResponse.redirect(new URL(homeFor(existing.role), url.origin));
    }
    if (desk === "customer") {
      const created = await registerGoogleCustomer(identity);
      if (created) {
        jar.set(SESSION_COOKIE, issueSession(created.id), sessionCookieOptions());
        return NextResponse.redirect(new URL("/", url.origin));
      }
    }
    jar.set(GOOGLE_PENDING_COOKIE, sealGooglePending(identity, desk), pendingCookieOptions());
    const next = desk === "chef" ? "/chef?google=finish" : "/driver?google=finish";
    return NextResponse.redirect(new URL(next, url.origin));
  });
}
