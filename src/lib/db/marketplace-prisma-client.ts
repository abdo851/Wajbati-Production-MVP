import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { StoreError } from "@/lib/errors";

const globalForMarketplace = globalThis as unknown as {
  marketplacePrisma?: PrismaClient;
  marketplacePrismaPool?: string;
};

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw.replace(/^prisma\+/, "")).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/**
 * Resolve Marketplace DB target safely:
 * - Vercel: CUSTOM_DATABASE_URL (owner must have applied marketplace migration)
 * - Local: RIGH_TEST_DATABASE_URL (or .env.test.local), must be localhost
 * Never silently target primary Supabase/Neon from a local process.
 */
export function resolveMarketplaceDatabaseUrl(): string {
  if (process.env.VERCEL === "1") {
    const url = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL || "";
    if (!url) {
      throw new StoreError("Marketplace database is not configured for this deployment.", 503);
    }
    return url;
  }

  const testEnv = loadEnvFile(resolve(process.cwd(), ".env.test.local"));
  const candidate =
    process.env.RIGH_TEST_DATABASE_URL ||
    testEnv.RIGH_TEST_DATABASE_URL ||
    process.env.MARKETPLACE_DATABASE_URL ||
    "";

  if (!candidate) {
    throw new StoreError(
      "Marketplace persistence requires RIGH_TEST_DATABASE_URL pointing at an isolated localhost PostgreSQL.",
      503,
    );
  }
  if (!isLocalhostUrl(candidate)) {
    throw new StoreError("Marketplace local persistence must use a localhost database only.", 503);
  }
  return candidate;
}

function fingerprint(raw: string): string {
  try {
    const url = new URL(raw.replace(/^prisma\+/, ""));
    const material = `${url.hostname}|${url.port || "5432"}|${(url.pathname || "/").replace(/^\//, "")}`;
    return createHash("sha256").update(material).digest("hex").slice(0, 16);
  } catch {
    return "unparseable";
  }
}

function createMarketplaceClient(url: string) {
  return new PrismaClient({
    datasources: { db: { url } },
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });
}

export function getMarketplacePrisma(): PrismaClient {
  const url = resolveMarketplaceDatabaseUrl();
  const key = fingerprint(url);
  if (!globalForMarketplace.marketplacePrisma || globalForMarketplace.marketplacePrismaPool !== key) {
    void globalForMarketplace.marketplacePrisma?.$disconnect();
    globalForMarketplace.marketplacePrisma = createMarketplaceClient(url);
    globalForMarketplace.marketplacePrismaPool = key;
  }
  return globalForMarketplace.marketplacePrisma;
}
