import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { freshExpiry, openSession, sealSession, sessionCookieOptions, type SessionPayload } from "@/lib/auth/session";
import { StoreError } from "@/lib/errors";
import type { GoogleIdentity } from "@/lib/types";

export const OAUTH_STATE_COOKIE = "wajbati_oauth_state";
export const GOOGLE_PENDING_COOKIE = "wajbati_google_pending";

const desks = ["customer", "chef", "driver"] as const;
export type GoogleDesk = (typeof desks)[number];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleDesk(value: string | null): GoogleDesk {
  if (value === "chef" || value === "driver" || value === "customer") return value;
  throw new StoreError("Choose a customer, chef, or driver sign-in.", 400);
}

export function googleStartUrl(origin: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new StoreError("Google sign-in is not configured yet.", 503);
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function newOauthState(desk: GoogleDesk): string {
  return `${desk}.${randomBytes(24).toString("base64url")}`;
}

export async function exchangeGoogleCode(origin: string, code: string): Promise<{ identity: GoogleIdentity; idToken: string | null }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new StoreError("Google sign-in is not configured yet.", 503);
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
  if (!tokenResponse.ok || !token.access_token) {
    throw new StoreError("Google did not confirm that sign-in.", 401);
  }
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified === false) {
    throw new StoreError("Google did not share a verified email.", 401);
  }
  return {
    identity: {
      sub: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name?.trim() || profile.email.split("@")[0] || "Wajbati",
    },
    idToken: token.id_token ?? null,
  };
}

type PendingGoogle = {
  provider: "local";
  userId: string;
  exp: number;
  google?: GoogleIdentity & { desk: GoogleDesk };
};

export function sealGooglePending(identity: GoogleIdentity, desk: GoogleDesk): string {
  const payload: PendingGoogle = {
    provider: "local",
    userId: "google",
    exp: Date.now() + 10 * 60 * 1000,
    google: { ...identity, desk },
  };
  return sealSession(payload as SessionPayload & PendingGoogle);
}

export async function readGooglePending(): Promise<(GoogleIdentity & { desk: GoogleDesk }) | null> {
  const jar = await cookies();
  const opened = openSession(jar.get(GOOGLE_PENDING_COOKIE)?.value) as (SessionPayload & {
    google?: GoogleIdentity & { desk: GoogleDesk };
  }) | null;
  const google = opened?.google;
  if (!google?.sub || !google.email || !desks.includes(google.desk)) return null;
  return google;
}

export function pendingCookieOptions() {
  return { ...sessionCookieOptions(), maxAge: 600 };
}

export function freshSessionExpiry(): number {
  return freshExpiry();
}
