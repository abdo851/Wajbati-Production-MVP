// Applies the admin credentials THROUGH the app's own secure endpoint so the
// in-memory graph cache stays coherent (direct SQL writes get overwritten by
// the app's full-graph persistence). Run: node scripts/set-admin.mjs
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "abderrahimallali92@gmail.com";
const NEW_PASSWORD = "Allali@@@@321";
// Fallback current password: the seed/demo password used when the DB is fresh.
const FALLBACK_CURRENT = "SahriAdmin2026!";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, desk: "admin" }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, cookie: cookies.map((c) => c.split(";")[0]).join("; ") };
}

const attempt = await login(EMAIL, NEW_PASSWORD);
if (attempt.status === 200) {
  console.log("Already up to date — new credentials work. Nothing to do.");
  process.exit(0);
}

const current = await login(EMAIL, FALLBACK_CURRENT);
if (current.status !== 200) {
  console.error(`Cannot authenticate with fallback password either (HTTP ${current.status}).`);
  process.exit(1);
}

const update = await fetch(`${BASE}/api/admin/account`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: current.cookie },
  body: JSON.stringify({ currentPassword: FALLBACK_CURRENT, newEmail: EMAIL, newPassword: NEW_PASSWORD }),
});
console.log("update:", update.status, (await update.text()).slice(0, 80));
if (update.status !== 200) process.exit(1);

const verify = await login(EMAIL, NEW_PASSWORD);
console.log("new login:", verify.status === 200 ? "OK" : `FAIL(${verify.status})`);
const old = await login(EMAIL, FALLBACK_CURRENT);
console.log("old login:", old.status === 401 || old.status === 403 ? "revoked OK" : `UNEXPECTED(${old.status})`);
const desk = await fetch(`${BASE}/api/admin/overview`, { headers: { Cookie: verify.cookie } });
console.log("admin desk:", desk.status === 200 ? "OK" : `FAIL(${desk.status})`);
process.exit(verify.status === 200 && desk.status === 200 ? 0 : 1);
