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
 * True only for the ordinary isolated local test database (127.0.0.1:55432/righ_test).
 * Fail closed on empty, malformed, shared, or non-isolated targets. Never logs the URL.
 */
export function databaseIsIsolatedLocalTestTarget(): boolean {
  const raw = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL || "";
  const value = raw.trim();
  if (!value) return false;
  try {
    const url = new URL(value.replace(/^prisma\+/, ""));
    const host = url.hostname.toLowerCase();
    if (!hostLooksLocal(host) || hostLooksShared(host)) return false;
    const port = url.port || "5432";
    const database = (url.pathname || "/").replace(/^\//, "");
    return port === "55432" && database === "righ_test";
  } catch {
    return false;
  }
}

function localAdminPreviewFlagEnabled(): boolean {
  // Prefer the explicit M0 preview flag; keep the older bypass name as an alias.
  return process.env.RIGH_LOCAL_ADMIN_PREVIEW === "1" || process.env.RIGH_ALLOW_ADMIN_BYPASS === "1";
}

function looksLikeHostedOrVercelDeployment(): boolean {
  // Platform marker used on Vercel builds/runtime. Do not treat a stray local token as enough.
  if (process.env.VERCEL === "1") return true;
  const vercelEnv = process.env.VERCEL_ENV;
  return vercelEnv === "production" || vercelEnv === "preview";
}

/**
 * Owner-approved temporary local admin preview convenience.
 * Requires ALL of:
 * - NODE_ENV === "development"
 * - RIGH_LOCAL_ADMIN_PREVIEW=1 (or legacy alias RIGH_ALLOW_ADMIN_BYPASS=1)
 * - not running on Vercel / hosted deployment env markers
 * - Prisma URL is the isolated local test DB (127.0.0.1:55432/righ_test)
 *
 * Never enable via query params or client-only values. Never set these flags on Vercel.
 */
export const ADMIN_AUTH_BYPASSED =
  process.env.NODE_ENV === "development" &&
  localAdminPreviewFlagEnabled() &&
  !looksLikeHostedOrVercelDeployment() &&
  databaseIsIsolatedLocalTestTarget();

/** True when the email is on the admin allowlist (role is not checked). */
export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase()));
}

export function isSuperAdmin(user: Pick<AuthUser, "email" | "role"> | null | undefined): boolean {
  return Boolean(user && user.role === "admin" && isAllowlistedAdminEmail(user.email));
}
