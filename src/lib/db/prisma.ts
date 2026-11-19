import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: string;
};

const POOL_REVISION = "neon-pooler-v4";
const CONNECT_TIMEOUT_SECONDS = "10";

function withNeonPooler(base: string) {
  const at = base.lastIndexOf("@");
  if (at === -1) return base;
  const prefix = base.slice(0, at + 1);
  const rest = base.slice(at + 1);
  const slash = rest.indexOf("/");
  const hostPort = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "" : rest.slice(slash);
  const colon = hostPort.lastIndexOf(":");
  const host = colon === -1 ? hostPort : hostPort.slice(0, colon);
  const port = colon === -1 ? "" : hostPort.slice(colon);
  if (!host.endsWith(".neon.tech") || host.includes("-pooler")) return base;
  const dot = host.indexOf(".");
  const pooledHost = dot === -1 ? `${host}-pooler` : `${host.slice(0, dot)}-pooler${host.slice(dot)}`;
  return `${prefix}${pooledHost}${port}${path}`;
}

function pooledDatabaseUrl(raw: string | undefined) {
  if (!raw) return undefined;
  const splitAt = raw.indexOf("?");
  const base = withNeonPooler(splitAt === -1 ? raw : raw.slice(0, splitAt));
  const params = new URLSearchParams(splitAt === -1 ? "" : raw.slice(splitAt + 1));
  const host = base.split("@")[1] ?? "";
  if (host.includes("-pooler")) params.set("pgbouncer", "true");
  if (!params.has("connection_limit")) params.set("connection_limit", "10");
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
