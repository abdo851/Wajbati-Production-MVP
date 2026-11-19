import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: string;
};

const POOL_REVISION = "serverless-pooler-v5";
const CONNECT_TIMEOUT_SECONDS = "10";

function rewriteHostPort(base: string, rewrite: (host: string, port: string) => { host: string; port: string }) {
  const at = base.lastIndexOf("@");
  if (at === -1) return base;
  const prefix = base.slice(0, at + 1);
  const rest = base.slice(at + 1);
  const slash = rest.indexOf("/");
  const hostPort = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "" : rest.slice(slash);
  const colon = hostPort.lastIndexOf(":");
  const host = colon === -1 ? hostPort : hostPort.slice(0, colon);
  const port = colon === -1 ? "" : hostPort.slice(colon + 1);
  const next = rewrite(host, port);
  const portPart = next.port ? `:${next.port}` : "";
  return `${prefix}${next.host}${portPart}${path}`;
}

function withNeonPooler(base: string) {
  return rewriteHostPort(base, (host, port) => {
    if (!host.endsWith(".neon.tech") || host.includes("-pooler")) {
      return { host, port };
    }
    const dot = host.indexOf(".");
    const pooledHost =
      dot === -1 ? `${host}-pooler` : `${host.slice(0, dot)}-pooler${host.slice(dot)}`;
    return { host: pooledHost, port };
  });
}

/**
 * Supabase session pooler (port 5432) exhausts quickly under Vercel serverless
 * (EMAXCONNSESSION / pool_size 15). Prefer transaction pooler (6543) on Vercel.
 */
function withSupabaseTransactionPooler(base: string) {
  if (!process.env.VERCEL) return base;
  return rewriteHostPort(base, (host, port) => {
    if (!host.includes("pooler.supabase.com")) return { host, port };
    return { host, port: "6543" };
  });
}

function pooledDatabaseUrl(raw: string | undefined) {
  if (!raw) return undefined;
  const splitAt = raw.indexOf("?");
  let base = withNeonPooler(splitAt === -1 ? raw : raw.slice(0, splitAt));
  base = withSupabaseTransactionPooler(base);
  const params = new URLSearchParams(splitAt === -1 ? "" : raw.slice(splitAt + 1));
  const host = base.split("@")[1] ?? "";
  if (host.includes("-pooler") || host.includes("pooler.supabase.com")) {
    params.set("pgbouncer", "true");
  }
  // Serverless: one connection per isolate avoids session-pool exhaustion.
  const defaultLimit = process.env.VERCEL ? "1" : "5";
  params.set("connection_limit", defaultLimit);
  params.set("connect_timeout", CONNECT_TIMEOUT_SECONDS);
  params.set("pool_timeout", CONNECT_TIMEOUT_SECONDS);
  params.delete("channel_binding");
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Fingerprint the DB target without retaining credentials.
 * Forces Prisma client recreation when CUSTOM_DATABASE_URL changes
 * (Next.js env reload alone does not refresh the global singleton).
 */
function databaseTargetFingerprint(raw: string | undefined): string {
  if (!raw) return "missing";
  try {
    const url = new URL(raw.replace(/^prisma\+/, ""));
    const host = url.hostname.toLowerCase();
    const ref =
      (decodeURIComponent(url.username || "").match(/^postgres\.([a-z0-9]+)$/) || [])[1] ||
      (host.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1] ||
      "";
    const db = (url.pathname || "/").replace(/^\//, "") || "postgres";
    const material = `${host}|${url.port || "5432"}|${db}|${ref}`;
    return createHash("sha256").update(material).digest("hex").slice(0, 16);
  } catch {
    return "unparseable";
  }
}

function createClient() {
  const url = pooledDatabaseUrl(process.env.CUSTOM_DATABASE_URL);
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    transactionOptions: {
      maxWait: 10_000,
      timeout: 15_000,
    },
  });
}

function poolKey() {
  return `${POOL_REVISION}:${databaseTargetFingerprint(process.env.CUSTOM_DATABASE_URL)}`;
}

const nextPool = poolKey();
if (!globalForPrisma.prisma || globalForPrisma.prismaPool !== nextPool) {
  void globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = createClient();
  globalForPrisma.prismaPool = nextPool;
}

export const prisma = globalForPrisma.prisma as PrismaClient;
