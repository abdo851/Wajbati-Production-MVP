// Full end-to-end flow test against the local dev server.
// Chef register -> admin approve -> publish meal with 6 images -> customer order
// -> driver accept/pick_up/deliver (OTP) -> verify wallet commissions + Task 2 lookup.
//
// FAIL-CLOSED: this script writes application data. It must never run against Neon
// or any shared/production database. Localhost alone is NOT proof of isolation.
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const jars = {};
const results = [];
let failures = 0;

function loadDotEnvKeys(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function databaseHostLooksShared(raw) {
  if (!raw || !String(raw).trim()) return { shared: false, reason: "no-url" };
  try {
    const host = new URL(String(raw).replace(/^prisma\+/, "")).hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1") return { shared: false, reason: "local-host" };
    if (host.endsWith(".neon.tech") || host.includes("-pooler")) return { shared: true, reason: "neon-or-pooler" };
    if (host.endsWith(".supabase.co") || host.includes("amazonaws.com") || host.includes("azure.com")) {
      return { shared: true, reason: "hosted-shared" };
    }
    return { shared: true, reason: "non-local-host" };
  } catch {
    return { shared: true, reason: "unreadable-url" };
  }
}

function assertE2EDatabaseSafety() {
  if (process.env.E2E_ALLOW_DB_WRITES !== "1") {
    throw new Error(
      "E2E refused: set E2E_ALLOW_DB_WRITES=1 only for a dedicated isolated test database. Localhost is not enough.",
    );
  }
  if (process.env.E2E_DATABASE_MODE !== "isolated") {
    throw new Error(
      "E2E refused: set E2E_DATABASE_MODE=isolated to confirm the app points at a dedicated test database.",
    );
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("E2E refused: E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set explicitly (no hardcoded fallbacks).");
  }
  const fileEnv = {
    ...loadDotEnvKeys(resolve(process.cwd(), ".env")),
    ...loadDotEnvKeys(resolve(process.cwd(), ".env.local")),
  };
  const dbUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL || fileEnv.CUSTOM_DATABASE_URL || fileEnv.DATABASE_URL;
  const check = databaseHostLooksShared(dbUrl);
  if (check.shared || check.reason === "no-url") {
    throw new Error(
      `E2E refused: database target is not a proven isolated local host (${check.reason}). Refusing writes to Neon/shared/production.`,
    );
  }
}

function report(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function call(label, method, path, { body, form, jar } = {}) {
  const headers = {};
  if (jars[jar]) headers.Cookie = jars[jar];
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + path, { method, headers, body: payload });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (jar && setCookies.length) {
    jars[jar] = setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  console.log(`  [${label}] ${method} ${path} -> ${response.status}`);
  return { status: response.status, json, text };
}

const stamp = Date.now();
const chefEmail = `e2e-chef-${stamp}@test.ma`;
const chefPassword = "E2EChef2026!";
const chefPhone = `06${String(stamp).slice(-8)}`;
const kitchenName = `E2E Kitchen ${stamp}`;
const mealTitle = `E2E Test Meal ${stamp}`;
const customerPhone = `0699${String(stamp).slice(-6)}`;
const customerEmail = `e2e-customer-${stamp}@test.ma`;

async function wallet(jar, label) {
  const res = await call(label, "GET", "/api/wallet", { jar });
  const balance = res.json?.wallet?.balanceMad ?? res.json?.balanceMad ?? null;
  return { status: res.status, balance, raw: res.json };
}

async function main() {
  assertE2EDatabaseSafety();

  const signaturePng = readFileSync("tmp-e2e/img6.png");
  const signatureDataUrl = `data:image/png;base64,${signaturePng.toString("base64")}`;

  // 1. Register chef (multipart: CIN photo + signature + compliance)
  const regForm = new FormData();
  regForm.set("fullName", "E2E Chef");
  regForm.set("kitchenName", kitchenName);
  regForm.set("email", chefEmail);
  regForm.set("phone", chefPhone);
  regForm.set("password", chefPassword);
  regForm.set("passwordConfirm", chefPassword);
  regForm.set("city", "Casablanca");
  regForm.set("foodSafetyAccepted", "true");
  regForm.set("autoEntrepreneurNumber", "1234567890");
  regForm.set("signature", signatureDataUrl);
  regForm.set("cinFront", new Blob([signaturePng], { type: "image/png" }), "cin.png");
  const reg = await call("chef-register", "POST", "/api/auth/chef/register", { form: regForm });
  report("Chef registration", reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);

  // 2. Admin login + approve
  const adminLogin = await call("admin-login", "POST", "/api/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, desk: "admin" },
    jar: "admin",
  });
  report("Admin login", adminLogin.status === 200, `HTTP ${adminLogin.status}`);
  const pending = await call("admin-pending", "GET", "/api/admin/chefs", { jar: "admin" });
  const target = (pending.json?.chefs ?? []).find((chef) => chef.kitchenName === kitchenName);
  report("Chef appears in pending list", Boolean(target), target ? `chefId=${target.id}` : "not found");
  const approval = await call("admin-approve", "PATCH", "/api/admin/chefs", {
    jar: "admin",
    body: { chefId: target?.id, status: "approved" },
  });
  report("Admin approves chef", approval.status === 200, `HTTP ${approval.status}`);

  // 3. Chef login
  const chefLogin = await call("chef-login", "POST", "/api/auth/login", {
    body: { email: chefEmail, password: chefPassword, desk: "chef" },
    jar: "chef",
  });
  report("Chef login after approval", chefLogin.status === 200, `HTTP ${chefLogin.status}`);

  // 3b. Admin tops up the new chef's wallet (required before publishing)
  const chefUserId = chefLogin.json?.user?.id;
  const chefTopup = await call("chef-topup", "POST", "/api/admin/wallets", {
    jar: "admin",
    body: { ownerId: chefUserId, amountMad: 100 },
  });
  report("Admin tops up chef wallet", chefTopup.status === 200, `HTTP ${chefTopup.status}`);

  // 4. Publish meal with 6 images
  const form = new FormData();
  form.set("title", mealTitle);
  form.set("description", "End-to-end multi-image test meal with six photos.");
  form.set("priceMad", "100");
  form.set("maxQuantity", "10");
  for (let i = 1; i <= 6; i += 1) {
    const bytes = readFileSync(`tmp-e2e/img${i}.png`);
    form.append("photo", new Blob([bytes], { type: "image/png" }), `img${i}.png`);
  }
  const publish = await call("publish", "POST", "/api/chef/meals", { jar: "chef", form });
  report("Publish meal with 6 images", publish.status === 201, `HTTP ${publish.status}`);

  // 5. Board shows meal + all photo URLs
  const board = await call("board", "GET", "/api/meals");
  const meal = (board.json?.meals ?? []).find((item) => item.title === mealTitle);
  report("Meal on today's board", Boolean(meal), meal ? `id=${meal.id}` : "missing");
  if (!meal) {
    console.log("\nAborting: meal not published — later steps depend on it.");
    process.exit(1);
  }
  const photoCount = meal?.photoUrls?.length ?? 0;
  report("Meal card exposes all images", photoCount >= 6, `photoUrls=${photoCount}`);

  const photo0 = await call("photo-0", "GET", `/api/meals/${meal.id}/photo?i=0`);
  const photo5 = await call("photo-5", "GET", `/api/meals/${meal.id}/photo?i=5`);
  report(
    "Images actually served",
    photo0.status === 200 && photo5.status === 200 && (photo0.text.length > 1000) === true,
    `i=0:${photo0.status} ${photo0.text.length}B, i=5:${photo5.status} ${photo5.text.length}B`,
  );

  // 6. Register + approve a fresh driver (demo drivers are not seeded in this DB)
  const driverPhone = `07${String(stamp).slice(-8)}`;
  const driverForm = new FormData();
  driverForm.set("fullName", "E2E Driver");
  driverForm.set("email", `e2e-driver-${stamp}@test.ma`);
  driverForm.set("phone", driverPhone);
  driverForm.set("password", "E2EDriver2026!");
  driverForm.set("passwordConfirm", "E2EDriver2026!");
  driverForm.set("city", "Casablanca");
  driverForm.set("vehicle", "motorbike");
  driverForm.set("signature", signatureDataUrl);
  driverForm.set("license", new Blob([signaturePng], { type: "image/png" }), "license.png");
  driverForm.set("vehicle_papers", new Blob([signaturePng], { type: "image/png" }), "papers.png");
  const driverReg = await call("driver-register", "POST", "/api/auth/driver/register", { form: driverForm });
  report("Driver registration", driverReg.status === 200 || driverReg.status === 201, `HTTP ${driverReg.status}`);
  const driverId = driverReg.json?.user?.driverId;
  const driverApprove = await call("driver-approve", "POST", "/api/admin/drivers", {
    jar: "admin",
    body: { driverId, status: "approved" },
  });
  report("Admin approves driver", driverApprove.status === 200, `HTTP ${driverApprove.status}`);

  // 6b. Wallets BEFORE (driver topped up too — acceptDelivery requires an open wallet)
  const chefWalletBefore = await wallet("chef", "wallet-chef-before");
  const driverLogin = await call("driver-login", "POST", "/api/auth/driver/login", {
    body: { identifier: driverPhone, password: "E2EDriver2026!" },
    jar: "driver",
  });
  report("Driver login", driverLogin.status === 200, `HTTP ${driverLogin.status}`);
  const driverTopup = await call("driver-topup", "POST", "/api/admin/wallets", {
    jar: "admin",
    body: { ownerId: driverLogin.json?.user?.id, amountMad: 100 },
  });
  report("Admin tops up driver wallet", driverTopup.status === 200, `HTTP ${driverTopup.status}`);
  const driverWalletBefore = await wallet("driver", "wallet-driver-before");
  report("Wallets readable before", chefWalletBefore.balance !== null && driverWalletBefore.balance !== null,
    `chef=${chefWalletBefore.balance} driver=${driverWalletBefore.balance}`);

  // 7. Customer places order (guest checkout)
  const order = await call("order", "POST", "/api/orders", {
    body: {
      mealId: meal.id,
      customerName: "E2E Customer",
      customerPhone: "0612345678",
      deliveryAddress: "Casablanca, E2E Street 1",
      customerNotes: "e2e flow",
      quantity: 2,
      deliveryLat: 33.5731,
      deliveryLng: -7.5898,
    },
  });
  const receipt = order.json?.order;
  report("Guest order created", order.status === 201 && Boolean(receipt), `HTTP ${order.status} total=${receipt?.totalMad} fee=${receipt?.deliveryFeeMad}`);
  report("Order totals correct (2 x 100 MAD + 15 fee)", receipt?.totalMad === 200 && receipt?.deliveryFeeMad === 15,
    `total=${receipt?.totalMad} fee=${receipt?.deliveryFeeMad}`);

  // Chef confirms order so driver can accept (status pending -> confirmed)
  const chefBoard = await call("chef-board", "GET", "/api/chef/board", { jar: "chef" });
  const myOrder = (chefBoard.json?.orders ?? []).find((item) => item.id === receipt?.id);
  report("Order visible on chef desk", Boolean(myOrder), myOrder ? `status=${myOrder.status}` : "missing");
  const confirm = await call("chef-confirm", "PATCH", "/api/chef/orders", {
    jar: "chef",
    body: { orderId: receipt.id, status: "confirmed" },
  });
  report("Chef confirms order", confirm.status === 200, `HTTP ${confirm.status}`);

  // 8. Driver flow: accept -> pick_up -> deliver with OTP
  const accept = await call("driver-accept", "POST", "/api/driver/accept", { jar: "driver", body: { orderId: receipt.id } });
  report("Driver accepts delivery", accept.status === 200, `HTTP ${accept.status}`);
  const pickup = await call("driver-pickup", "POST", "/api/driver/status", { jar: "driver", body: { orderId: receipt.id, action: "pick_up" } });
  report("Driver picks up", pickup.status === 200, `HTTP ${pickup.status}`);
  const wrongCode = await call("driver-wrong-otp", "POST", "/api/driver/status", { jar: "driver", body: { orderId: receipt.id, action: "deliver", code: "0000" } });
  report("Wrong OTP rejected", wrongCode.status === 409, `HTTP ${wrongCode.status}`);
  const deliver = await call("driver-deliver", "POST", "/api/driver/status", { jar: "driver", body: { orderId: receipt.id, action: "deliver", code: receipt.deliveryCode } });
  report("Driver delivers with OTP", deliver.status === 200, `HTTP ${deliver.status}`);

  // 9. Wallets AFTER
  const chefWalletAfter = await wallet("chef", "wallet-chef-after");
  const driverWalletAfter = await wallet("driver", "wallet-driver-after");
  const chefDelta = Math.round((chefWalletAfter.balance - chefWalletBefore.balance) * 100) / 100;
  const driverDelta = Math.round((driverWalletAfter.balance - driverWalletBefore.balance) * 100) / 100;
  report("Chef service fee deducted (7 MAD x 2 portions, price >= 40)", chefDelta === -14, `delta=${chefDelta} MAD (expected -14)`);
  report("Driver commission deducted (1 MAD x 2 portions)", driverDelta === -2, `delta=${driverDelta} MAD (expected -2)`);

  // 10. Task 2 verification: customer registers, follows chef, email lookup
  const custReg = await call("customer-register", "POST", "/api/auth/customer/register", {
    body: { fullName: "E2E Customer", email: customerEmail, phone: customerPhone, password: "E2ECust2026!", passwordConfirm: "E2ECust2026!" },
  });
  report("Customer registration", custReg.status === 200 || custReg.status === 201, `HTTP ${custReg.status}`);
  const custLogin = await call("customer-login", "POST", "/api/auth/customer/login", {
    body: { identifier: customerEmail, password: "E2ECust2026!" },
    jar: "customer",
  });
  report("Customer login", custLogin.status === 200, `HTTP ${custLogin.status}`);
  const follow = await call("follow", "POST", "/api/follow", { jar: "customer", body: { chefId: meal.chefId } });
  report("Customer follows chef", follow.status === 200, `HTTP ${follow.status}`);
  const lookup = await call("following-lookup", "POST", "/api/following/lookup", { body: { email: customerEmail } });
  const lookupHit = (lookup.json?.meals ?? []).some((item) => item.id === meal.id);
  report("Email-only following feed returns followed chef meals", lookup.status === 200 && lookupHit, `HTTP ${lookup.status} meals=${lookup.json?.meals?.length ?? 0}`);

  console.log("\n================ E2E SUMMARY ================");
  for (const item of results) console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  console.log(`\n${failures === 0 ? "END-TO-END TEST PASSED" : `END-TO-END TEST FAILED (${failures} failures)`}`);
  console.log(`Wallet balances: chef ${chefWalletBefore.balance} -> ${chefWalletAfter.balance} | driver ${driverWalletBefore.balance} -> ${driverWalletAfter.balance}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
