import { StoreError } from "@/lib/errors";
import { databaseLooksSharedOrProduction, supabaseTargetLooksSharedOrUnidentifiable } from "@/lib/super-admin";

/**
 * Trusted cloud deployment (Vercel injects VERCEL=1).
 * Local `next start` / `next dev` do not get this unless someone spoofs it.
 * Non-Vercel production hosts are not auto-trusted — see assertDatabaseWriteAllowed.
 */
export function isTrustedDeploymentContext(): boolean {
  return process.env.VERCEL === "1";
}

export type DatabaseWriteSurface = "prisma" | "supabase";

const PROJECT_REF_RE = /^[a-z0-9]+$/;

/**
 * Parse a PostgreSQL connection URL for identity checks only.
 * Never logs the URL, username, password, or query string.
 */
function parsePostgresConnectionUrl(raw: string): URL | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const normalized = value.replace(/^prisma\+/, "");
    const url = new URL(normalized);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Positively extract a Supabase project ref from a Postgres URL.
 * Direct: db.<ref>.supabase.co
 * Session/transaction pooler: *.pooler.supabase.com with username postgres.<ref>
 * Returns null when identity is ambiguous, Neon, or non-Supabase.
 */
function extractSupabasePostgresProjectRef(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  if (host.endsWith(".neon.tech") || host.includes("neon.tech")) return null;

  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  if (direct) {
    const ref = direct[1];
    return PROJECT_REF_RE.test(ref) ? ref : null;
  }

  const isPooler =
    host === "pooler.supabase.com" ||
    host.endsWith(".pooler.supabase.com");
  if (!isPooler) return null;

  let username = "";
  try {
    username = decodeURIComponent(url.username || "").trim().toLowerCase();
  } catch {
    return null;
  }
  const pooled = /^postgres\.([a-z0-9]+)$/.exec(username);
  if (!pooled) return null;
  const ref = pooled[1];
  return PROJECT_REF_RE.test(ref) ? ref : null;
}

/**
 * Narrow local opt-in: allow Prisma writes to one explicitly approved Supabase Postgres project.
 * Requires RIGH_APPROVED_SUPABASE_PROJECT_REF and a positively identified matching CUSTOM_DATABASE_URL.
 * Does not authorize other providers, other Supabase projects, or ambiguous URLs.
 */
export function isApprovedLocalSupabasePostgresTarget(): boolean {
  const approved = (process.env.RIGH_APPROVED_SUPABASE_PROJECT_REF || "").trim().toLowerCase();
  if (!approved || !PROJECT_REF_RE.test(approved)) return false;

  const raw = process.env.CUSTOM_DATABASE_URL || "";
  const url = parsePostgresConnectionUrl(raw);
  if (!url) return false;

  const ref = extractSupabasePostgresProjectRef(url);
  if (!ref) return false;

  return ref === approved;
}

/**
 * Blocks local/untrusted processes from writing to shared/hosted databases.
 * - Trusted Vercel deployments may write to Neon/Supabase (legitimate production).
 * - Local processes (any NODE_ENV) pointing at shared/unidentifiable targets are rejected,
 *   except the single explicitly approved Supabase Postgres project (prisma surface only).
 * - Explicit opt-in remains: RIGH_ALLOW_SHARED_DB_WRITES=1 (never enable in env files here).
 * Never logs connection strings or secrets.
 */
export function assertDatabaseWriteAllowed(surface: DatabaseWriteSurface = "prisma"): void {
  if (process.env.RIGH_ALLOW_SHARED_DB_WRITES === "1") return;
  if (isTrustedDeploymentContext()) return;

  const shared =
    surface === "supabase" ? supabaseTargetLooksSharedOrUnidentifiable() : databaseLooksSharedOrProduction();

  if (!shared) return;

  if (surface === "prisma" && isApprovedLocalSupabasePostgresTarget()) return;

  throw new StoreError(
    "كتابة قاعدة البيانات مرفوضة: عملية محلية/غير موثوقة تشير إلى Neon أو Supabase أو هدف مشترك/غير معرّف. استخدم قاعدة محلية معزولة، أو عيّن RIGH_APPROVED_SUPABASE_PROJECT_REF لمشروع Supabase المعتمد فقط، أو انشر على Vercel، أو عيّن RIGH_ALLOW_SHARED_DB_WRITES=1 عن قصد فقط.",
    503,
  );
}

/** @deprecated Prefer assertDatabaseWriteAllowed — kept for older call sites. */
export function assertDevelopmentDatabaseWriteAllowed(): void {
  assertDatabaseWriteAllowed("prisma");
}
