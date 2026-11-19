// Applies admin credentials through /api/admin/account. Env-only — no hardcoded secrets.
// Required: RIGH_ADMIN_OLD_EMAIL, RIGH_ADMIN_OLD_PASSWORD, RIGH_ADMIN_EMAIL, RIGH_ADMIN_NEW_PASSWORD
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OLD_EMAIL = process.env.RIGH_ADMIN_OLD_EMAIL;
const OLD_PASSWORD = process.env.RIGH_ADMIN_OLD_PASSWORD;
const NEW_EMAIL = process.env.RIGH_ADMIN_EMAIL;
const NEW_PASSWORD = process.env.RIGH_ADMIN_NEW_PASSWORD;

if (!OLD_EMAIL || !OLD_PASSWORD || !NEW_EMAIL || !NEW_PASSWORD) {
  console.error(
    "apply-admin refused: set RIGH_ADMIN_OLD_EMAIL, RIGH_ADMIN_OLD_PASSWORD, RIGH_ADMIN_EMAIL, RIGH_ADMIN_NEW_PASSWORD.",
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

const before = await login(OLD_EMAIL, OLD_PASSWORD);
console.log("old login:", before.status === 200 ? "OK" : `FAIL(${before.status})`);
if (before.status !== 200) process.exit(1);

const update = await fetch(`${BASE}/api/admin/account`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: before.cookie },
  body: JSON.stringify({
    currentPassword: OLD_PASSWORD,
    newEmail: NEW_EMAIL,
    newPassword: NEW_PASSWORD,
  }),
});
console.log("update:", update.status, (await update.text()).slice(0, 120));

const afterNew = await login(NEW_EMAIL, NEW_PASSWORD);
console.log(
  "new login:",
  afterNew.status === 200 ? "OK" : `FAIL(${afterNew.status})`,
);

const afterOld = await login(OLD_EMAIL, OLD_PASSWORD);
console.log(
  "old login after change:",
  afterOld.status === 401 || afterOld.status === 403
    ? "revoked OK"
    : `UNEXPECTED(${afterOld.status})`,
);

const session = await fetch(`${BASE}/api/admin/overview`, {
  headers: { Cookie: afterNew.cookie },
});
console.log(
  "admin desk with new creds:",
  session.status === 200 ? "OK" : `FAIL(${session.status})`,
);
process.exit(afterNew.status === 200 && session.status === 200 ? 0 : 1);
