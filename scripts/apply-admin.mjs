// Applies the new admin credentials through the secure /api/admin/account flow.
const BASE = "http://localhost:3000";
const OLD_EMAIL = "admin@wajbati.ma";
const OLD_PASSWORD = "SahriAdmin2026!";
const NEW_EMAIL = "abderrahimallali92@gmail.com";
const NEW_PASSWORD = "Allali@@@@321";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, desk: "admin" }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, cookie: cookies.map((c) => c.split(";")[0]).join("; ") };
}

const before = await login(OLD_EMAIL, OLD_PASSWORD);
console.log("old login:", before.status === 200 ? "OK" : `FAIL(${before.status})`);
if (before.status !== 200) process.exit(1);

const update = await fetch(`${BASE}/api/admin/account`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: before.cookie },
  body: JSON.stringify({ currentPassword: OLD_PASSWORD, newEmail: NEW_EMAIL, newPassword: NEW_PASSWORD }),
});
console.log("update:", update.status, (await update.text()).slice(0, 120));

const afterNew = await login(NEW_EMAIL, NEW_PASSWORD);
console.log("new login:", afterNew.status === 200 ? "OK" : `FAIL(${afterNew.status})`);

const afterOld = await login(OLD_EMAIL, OLD_PASSWORD);
console.log("old login after change:", afterOld.status === 401 || afterOld.status === 403 ? "revoked OK" : `UNEXPECTED(${afterOld.status})`);

// Verify the admin desk session still authorizes with the new email
const session = await fetch(`${BASE}/api/admin/overview`, { headers: { Cookie: afterNew.cookie } });
console.log("admin desk with new creds:", session.status === 200 ? "OK" : `FAIL(${session.status})`);
