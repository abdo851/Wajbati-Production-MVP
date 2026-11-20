/**
 * Ordinary local Next.js startup — always binds Prisma/auth to the isolated
 * localhost test database (righ_test:55432). Never rewrites .env.local.
 * Never prints connection strings.
 *
 * Usage: npm run dev
 * Explicit: npm run dev:local
 */
import { spawn } from "node:child_process";
import { applyIsolatedLocalDatabaseEnv } from "./lib/isolated-local-db.mjs";

let meta;
try {
  meta = applyIsolatedLocalDatabaseEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : "LOCAL refused: isolated database unavailable.");
  console.error("Set RIGH_TEST_DATABASE_URL in .env.test.local to 127.0.0.1:55432/righ_test, then retry.");
  console.error("Production/Supabase targets are rejected for ordinary local development.");
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    mode: "dev-isolated",
    hostKind: meta.hostKind,
    host: meta.host,
    port: meta.port,
    database: meta.database,
    refMatchesPrimary: meta.refMatchesPrimary,
    note: ".env.local left unchanged; process env forced to isolated test DB.",
  }),
);

const child = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
