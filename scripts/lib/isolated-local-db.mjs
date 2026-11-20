/**
 * Shared fail-closed helpers for ordinary local development and isolated tests.
 * Never prints connection strings, passwords, or full URLs.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

export function describeDatabaseTarget(raw) {
  try {
    const url = new URL(String(raw || "").replace(/^prisma\+/, ""));
    const host = url.hostname.toLowerCase();
    const port = url.port || "5432";
    const database = (url.pathname || "/").replace(/^\//, "") || "postgres";
    const hostKind =
      host === "127.0.0.1" || host === "localhost" || host === "::1"
        ? "local"
        : host.includes("supabase")
          ? "supabase"
          : host.includes("neon.tech")
            ? "neon"
            : "other";
    const ref =
      (decodeURIComponent(url.username || "").match(/^postgres\.([a-z0-9]+)$/) || [])[1] ||
      (host.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1] ||
      null;
    return {
      hostKind,
      host,
      port,
      database,
      user: decodeURIComponent(url.username || ""),
      refMatchesPrimary: ref === "npgoovxofxoheghlqlky",
    };
  } catch {
    return {
      hostKind: "unknown",
      host: "",
      port: "",
      database: "",
      user: "",
      refMatchesPrimary: false,
    };
  }
}

/**
 * Resolve and validate the isolated localhost test URL for ordinary local work.
 * Does not print secrets. Does not rewrite .env.local on disk.
 */
export function resolveIsolatedTestDatabaseUrl() {
  const testEnv = loadEnvFile(resolve(process.cwd(), ".env.test.local"));
  const testUrl = process.env.RIGH_TEST_DATABASE_URL || testEnv.RIGH_TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("LOCAL refused: RIGH_TEST_DATABASE_URL missing (.env.test.local).");
  }
  const meta = describeDatabaseTarget(testUrl);
  if (meta.hostKind !== "local") {
    throw new Error(
      `LOCAL refused: RIGH_TEST_DATABASE_URL hostKind=${meta.hostKind} (expected local).`,
    );
  }
  if (meta.refMatchesPrimary) {
    throw new Error("LOCAL refused: test URL matches the production Supabase project.");
  }
  if (meta.host.includes("neon.tech") || meta.host.includes("supabase")) {
    throw new Error("LOCAL refused: test URL looks remote/shared.");
  }
  // Preferred Docker compose target for this repo.
  if (meta.port && meta.port !== "55432") {
    throw new Error(`LOCAL refused: expected isolated port 55432 (got ${meta.port}).`);
  }
  if (meta.database && meta.database !== "righ_test") {
    throw new Error(`LOCAL refused: expected database righ_test (got ${meta.database}).`);
  }

  const appEnv = {
    ...loadEnvFile(resolve(process.cwd(), ".env")),
    ...loadEnvFile(resolve(process.cwd(), ".env.local")),
  };
  const primaryUrl = appEnv.CUSTOM_DATABASE_URL;
  if (primaryUrl) {
    const primary = describeDatabaseTarget(primaryUrl);
    if (primary.hostKind === "local" && primary.port === meta.port && primary.database === meta.database) {
      throw new Error("LOCAL refused: primary CUSTOM_DATABASE_URL collides with isolated test DB.");
    }
  }

  return { url: testUrl, meta };
}

/**
 * Force this process onto the isolated test database for ordinary local work.
 * Leaves .env.local untouched on disk. Clears shared-write opt-ins.
 */
export function applyIsolatedLocalDatabaseEnv() {
  const { url, meta } = resolveIsolatedTestDatabaseUrl();
  process.env.CUSTOM_DATABASE_URL = url;
  process.env.DATABASE_URL = url;
  process.env.RIGH_TEST_DATABASE_URL = url;
  process.env.RIGH_ALLOW_SHARED_DB_WRITES = "";
  process.env.VERCEL = "";
  process.env.RIGH_APPROVED_SUPABASE_PROJECT_REF = "";
  return meta;
}
