/**
 * Run a child command with the process forced onto the isolated test database.
 * Used for migrations, seeds, and other write tools during local work.
 *
 * Usage: node scripts/run-with-isolated-db.mjs -- <command> [args...]
 * Example: npm run db:migrate:isolated
 */
import { spawn } from "node:child_process";
import { applyIsolatedLocalDatabaseEnv } from "./lib/isolated-local-db.mjs";

const sep = process.argv.indexOf("--");
const args = sep >= 0 ? process.argv.slice(sep + 1) : process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/run-with-isolated-db.mjs -- <command> [args...]");
  process.exit(1);
}

let meta;
try {
  meta = applyIsolatedLocalDatabaseEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : "LOCAL refused: isolated database unavailable.");
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    mode: "run-with-isolated-db",
    hostKind: meta.hostKind,
    port: meta.port,
    database: meta.database,
    refMatchesPrimary: meta.refMatchesPrimary,
    command: args[0],
  }),
);

const [command, ...rest] = args;
const child = spawn(command, rest, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
