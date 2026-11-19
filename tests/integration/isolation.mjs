import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath) {
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

/**
 * Fail closed: integration tests may only target the dedicated local Docker DB.
 * Never prints connection strings or passwords.
 */
export function assertIsolatedTestDatabase() {
  const testEnv = loadEnvFile(resolve(process.cwd(), ".env.test.local"));
  const appEnv = {
    ...loadEnvFile(resolve(process.cwd(), ".env")),
    ...loadEnvFile(resolve(process.cwd(), ".env.local")),
  };
  const testUrl = process.env.RIGH_TEST_DATABASE_URL || testEnv.RIGH_TEST_DATABASE_URL;
  const primaryUrl = appEnv.CUSTOM_DATABASE_URL;
  if (!testUrl) {
    throw new Error("INTEGRATION refused: RIGH_TEST_DATABASE_URL missing (.env.test.local).");
  }
  let test;
  let primary;
  try {
    test = new URL(testUrl);
    primary = primaryUrl ? new URL(primaryUrl) : null;
  } catch {
    throw new Error("INTEGRATION refused: unreadable database URL.");
  }
  const host = test.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`INTEGRATION refused: test host is not localhost (${host}).`);
  }
  if (host.includes("neon.tech") || host.includes("supabase")) {
    throw new Error("INTEGRATION refused: test URL looks remote/shared.");
  }
  if (primary) {
    const pHost = primary.hostname.toLowerCase();
    if (pHost === host && (primary.port || "5432") === (test.port || "5432")) {
      throw new Error("INTEGRATION refused: test URL collides with primary CUSTOM_DATABASE_URL.");
    }
    const pref =
      (decodeURIComponent(primary.username || "").match(/^postgres\.([a-z0-9]+)$/) || [])[1] || null;
    if (pref === "npgoovxofxoheghlqlky" && pHost.includes("supabase")) {
      // expected primary — do not use it
    }
  }
  // Force Prisma client to the isolated URL for this process only.
  process.env.CUSTOM_DATABASE_URL = testUrl;
  process.env.DATABASE_URL = testUrl;
  process.env.RIGH_ALLOW_SHARED_DB_WRITES = "";
  process.env.VERCEL = "";
  process.env.RIGH_APPROVED_SUPABASE_PROJECT_REF = "";
  return {
    host,
    port: test.port || "5432",
    database: test.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(test.username || ""),
  };
}
