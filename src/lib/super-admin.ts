import type { AuthUser } from "@/lib/types";

/** Accounts allowed to open the desk. Override with WAJBATI_ADMIN_EMAIL. Both the current and the legacy admin emails work during the credential transition. */
const SUPER_ADMIN_EMAILS = [
  process.env.WAJBATI_ADMIN_EMAIL,
  "abderrahimallali92@gmail.com",
  "admin@wajbati.ma",
]
  .filter((email): email is string => Boolean(email))
  .map((email) => email.toLowerCase());

export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0];

function hostLooksLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function hostLooksShared(host: string): boolean {
  if (host.endsWith(".neon.tech")) return true;
  if (host.includes("-pooler")) return true;
  if (host.endsWith(".supabase.co")) return true;
  if (host.includes("amazonaws.com") || host.includes("azure.com") || host.includes("googleapis.com")) return true;
  return false;
}

/**
 * Parse a DB/API URL host without logging secrets. Fail closed on empty/malformed input.
 */
function urlHostLooksSharedOrUnidentifiable(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  try {
    const normalized = value.replace(/^prisma\+/, "");
    const host = new URL(normalized).hostname.toLowerCase();
    if (!host) return true;
    if (hostLooksLocal(host)) return false;
    if (hostLooksShared(host)) return true;
    // Unknown remote host — treat as shared (fail closed).
    return true;
  } catch {
    return true;
  }
}

/**
 * True when the Prisma/database URL points at Neon/shared/hosted DB, or cannot be identified.
 * Empty/malformed URLs fail closed. Never logs the connection string.
 */
export function databaseLooksSharedOrProduction(): boolean {
  const raw = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL || "";
  return urlHostLooksSharedOrUnidentifiable(raw);
}

/**
 * True when the configured Supabase project URL is shared/hosted or unidentifiable.
 * Used for DATA_PROVIDER=supabase write guards. Never logs the URL.
 */
export function supabaseTargetLooksSharedOrUnidentifiable(): boolean {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return urlHostLooksSharedOrUnidentifiable(raw);
}

/**
 * Owner-approved temporary local admin convenience.
 * Requires ALL of:
 * - NODE_ENV === "development"
 * - RIGH_ALLOW_ADMIN_BYPASS === "1" (explicit opt-in; never set on Vercel)
 * - database is not Neon / shared / production-like
 */
export const ADMIN_AUTH_BYPASSED =
  process.env.NODE_ENV === "development" &&
  process.env.RIGH_ALLOW_ADMIN_BYPASS === "1" &&
  !databaseLooksSharedOrProduction();

export function isSuperAdmin(user: Pick<AuthUser, "email" | "role"> | null | undefined): boolean {
  return Boolean(user && user.role === "admin" && SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase()));
}
