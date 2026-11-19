// Applies the admin credentials THROUGH the app's own secure endpoint so the
// in-memory graph cache stays coherent. Credentials via env only — never hardcode.
// Required: RIGH_ADMIN_EMAIL, RIGH_ADMIN_NEW_PASSWORD
// Optional: RIGH_ADMIN_FALLBACK_PASSWORD (current password if new not yet set)
// Run: node scripts/set-admin.mjs
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.RIGH_ADMIN_EMAIL;
const NEW_PASSWORD = process.env.RIGH_ADMIN_NEW_PASSWORD;
const FALLBACK_CURRENT = process.env.RIGH_ADMIN_FALLBACK_PASSWORD || "";

if (!EMAIL || !NEW_PASSWORD) {
  console.error(
    "set-admin refused: set RIGH_ADMIN_EMAIL and RIGH_ADMIN_NEW_PASSWORD (no hardcoded credentials).",
  );
  process.exit(1);
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, desk: "admin" }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  return {
    status: res.status,
    cookie: cookies.map((c) => c.split(";")[0]).join("; "),
  };
}

const attempt = await login(EMAIL, NEW_PASSWORD);
if (attempt.status === 200) {
  console.log("Already up to date — new credentials work. Nothing to do.");
  process.exit(0);
}

if (!FALLBACK_CURRENT) {
  console.error(
    `New password login failed (HTTP ${attempt.status}) and RIGH_ADMIN_FALLBACK_PASSWORD is unset.`,
  );
  process.exit(1);
}

const current = await login(EMAIL, FALLBACK_CURRENT);
if (current.status !== 200) {
  console.error(
    `Cannot authenticate with fallback password either (HTTP ${current.status}).`,
  );
  process.exit(1);
}

const update = await fetch(`${BASE}/api/admin/account`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: current.cookie },
  body: JSON.stringify({
    currentPassword: FALLBACK_CURRENT,
    newEmail: EMAIL,
    newPassword: NEW_PASSWORD,
  }),
});
console.log("update:", update.status, (await update.text()).slice(0, 80));
if (update.status !== 200) process.exit(1);

const verify = await login(EMAIL, NEW_PASSWORD);
console.log(
  "verify new login:",
  verify.status === 200 ? "OK" : `FAIL(${verify.status})`,
);
process.exit(verify.status === 200 ? 0 : 1);
