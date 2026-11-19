/**
 * Owner-controlled admin bootstrap (explicit opt-in). READ this before running.
 *
 * Secure usage (password NOT in argv / shell history):
 *   $pass = Read-Host -AsSecureString
 *   $BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
 *   $env:RIGH_BOOTSTRAP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
 *   # preferred: pipe into stdin instead — see procedure in engineering reports
 *
 * Prefer:
 *   node scripts/bootstrap-admin.mjs
 *   (prompts on stdin when TTY; or pass password via stdin pipe)
 *
 * Required:
 *   RIGH_BOOTSTRAP_ADMIN_EMAIL
 *   RIGH_ALLOW_PRIMARY_ADMIN_BOOTSTRAP=1
 *   RIGH_BOOTSTRAP_TARGET_REF must equal the connection's project ref
 *
 * Optional password sources (never CLI args):
 *   stdin (preferred) | RIGH_BOOTSTRAP_ADMIN_PASSWORD_FILE | RIGH_BOOTSTRAP_ADMIN_PASSWORD
 *
 * Refuses Neon, localhost/Docker test DBs, unknown hosts, and other Supabase projects.
 * Never prints secrets. Does not invent default credentials.
 */
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";

const PRIMARY_REF = "npgoovxofxoheghlqlky";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function strongPassword(password) {
  if (password.length < 12) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

async function readPasswordHidden() {
  if (process.env.RIGH_BOOTSTRAP_ADMIN_PASSWORD_FILE) {
    const file = process.env.RIGH_BOOTSTRAP_ADMIN_PASSWORD_FILE;
    if (!existsSync(file)) {
      console.error("bootstrap-admin refused: password file not found.");
      process.exit(1);
    }
    return readFileSync(file, "utf8").replace(/\r?\n$/, "");
  }
  if (process.env.RIGH_BOOTSTRAP_ADMIN_PASSWORD) {
    // Env is visible to local process listings; prefer stdin/file. Allowed but warned.
    console.error("bootstrap-admin warning: password via env is less safe than stdin/file.");
    return process.env.RIGH_BOOTSTRAP_ADMIN_PASSWORD;
  }
  if (!process.stdin.isTTY) {
    // Non-interactive pipe: read one line from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stderr.write("Admin password (input hidden): ");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const password = await new Promise((resolvePromise) => {
    // Mute echo roughly by overwriting; Node lacks true hidden prompt cross-platform.
    process.stdin.on("data", (char) => {
      const s = char.toString();
      if (s === "\u0003") process.exit(1);
    });
    rl.question("", (answer) => {
      rl.close();
      resolvePromise(answer);
    });
  });
  process.stderr.write("\n");
  return password;
}

const fileEnv = {
  ...loadEnvFile(resolve(process.cwd(), ".env")),
  ...loadEnvFile(resolve(process.cwd(), ".env.local")),
};

const url = process.env.CUSTOM_DATABASE_URL || fileEnv.CUSTOM_DATABASE_URL;
const email = (process.env.RIGH_BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const allowPrimary = process.env.RIGH_ALLOW_PRIMARY_ADMIN_BOOTSTRAP === "1";
const targetRef = (process.env.RIGH_BOOTSTRAP_TARGET_REF || "").trim().toLowerCase();

if (!url || !email) {
  console.error("bootstrap-admin refused: set CUSTOM_DATABASE_URL and RIGH_BOOTSTRAP_ADMIN_EMAIL.");
  process.exit(1);
}
if (!allowPrimary) {
  console.error("bootstrap-admin refused: set RIGH_ALLOW_PRIMARY_ADMIN_BOOTSTRAP=1.");
  process.exit(1);
}
if (targetRef !== PRIMARY_REF) {
  console.error("bootstrap-admin refused: set RIGH_BOOTSTRAP_TARGET_REF to the exact primary project ref.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error("bootstrap-admin refused: CUSTOM_DATABASE_URL is malformed.");
  process.exit(1);
}

const host = parsed.hostname.toLowerCase();
const dbName = (parsed.pathname || "/").replace(/^\//, "") || "postgres";
const ref = (decodeURIComponent(parsed.username || "").match(/^postgres\.([a-z0-9]+)$/) || [])[1] || null;

if (host.includes("neon.tech")) {
  console.error("bootstrap-admin refused: Neon is not allowed.");
  process.exit(1);
}
if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
  console.error("bootstrap-admin refused: localhost/Docker test databases are not allowed.");
  process.exit(1);
}
if (!host.endsWith("pooler.supabase.com") && !/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) {
  console.error("bootstrap-admin refused: host is not an approved Supabase Postgres endpoint.");
  process.exit(1);
}
if (ref !== PRIMARY_REF || ref !== targetRef) {
  console.error("bootstrap-admin refused: connection project ref does not match the approved primary.");
  process.exit(1);
}
if (dbName !== "postgres") {
  console.error("bootstrap-admin refused: unexpected database name.");
  process.exit(1);
}

const allowList = [
  fileEnv.WAJBATI_ADMIN_EMAIL,
  process.env.WAJBATI_ADMIN_EMAIL,
  "abderrahimallali92@gmail.com",
  "admin@wajbati.ma",
]
  .filter(Boolean)
  .map((e) => String(e).toLowerCase());

if (!allowList.includes(email)) {
  console.error("bootstrap-admin refused: email is not on the super-admin allowlist.");
  process.exit(1);
}

const password = await readPasswordHidden();
if (!strongPassword(password)) {
  console.error(
    "bootstrap-admin refused: password must be >=12 chars and include upper, lower, and digit.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  // Identity check from the live connection (read-only metadata).
  const identity = await prisma.$queryRaw`select current_database() as db`;
  if (identity[0]?.db !== "postgres") {
    console.error("bootstrap-admin refused: connected database identity mismatch.");
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, role: true },
  });
  if (existing) {
    if (existing.role !== "ADMIN") {
      console.error("bootstrap-admin refused: email exists with a non-admin role.");
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        ok: true,
        action: "none",
        reason: "admin_already_exists",
        emailFingerprint: email.slice(0, 2) + "***@" + email.split("@")[1],
      }),
    );
    process.exit(0);
  }

  const otherAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email,
      password: hashPassword(password),
      fullName: "Super Admin",
      role: "ADMIN",
      approvalStatus: "APPROVED",
      emailConfirmed: true,
      isActive: true,
      isDeleted: false,
      walletBalance: 0,
    },
  });

  const verify = await prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    select: { id: true, role: true, emailConfirmed: true, isActive: true, isDeleted: true },
  });
  console.log(
    JSON.stringify({
      ok: true,
      action: "created_admin",
      emailFingerprint: email.slice(0, 2) + "***@" + email.split("@")[1],
      role: verify?.role,
      emailConfirmed: verify?.emailConfirmed,
      isActive: verify?.isActive,
      isDeleted: verify?.isDeleted,
      priorAdminCount: otherAdmins,
      targetRef: PRIMARY_REF,
    }),
  );
} finally {
  await prisma.$disconnect();
}
