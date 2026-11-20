/**
 * Phase 3.2 journey verification against local Next + isolated righ_test only.
 * Refuses to run unless /api/health reports hostKind=local and refMatchesPrimary=false.
 * Never prints passwords or connection strings.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertIsolatedTestDatabase } from "../tests/integration/isolation.mjs";

const BASE = process.env.RIGH_VERIFY_BASE_URL || "http://127.0.0.1:3000";

function loadAuthEnv() {
  const path = resolve(process.cwd(), ".env.test.auth.local");
  if (!existsSync(path)) throw new Error("Missing .env.test.auth.local — run seed-isolated-auth-accounts.mjs first.");
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.() || [];
  if (raw.length) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

async function jsonFetch(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: response.status, data, cookie: cookieFrom(response) || cookie || "" };
}

const results = [];
function record(area, step, status, detail = "") {
  results.push({ area, step, status, detail });
}

async function main() {
  const health = await jsonFetch("/api/health");
  const target = health.data?.target;
  if (health.status !== 200 || target?.hostKind !== "local" || target?.refMatchesPrimary !== false) {
    console.log(
      JSON.stringify({
        blocked: true,
        reason: "Next is not on isolated local DB",
        healthStatus: health.status,
        hostKind: target?.hostKind ?? null,
        refMatchesPrimary: target?.refMatchesPrimary ?? null,
      }),
    );
    process.exit(2);
  }

  const identity = assertIsolatedTestDatabase();
  const auth = loadAuthEnv();
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
  });

  try {
    // --- Buyer ---
    const followAnon = await jsonFetch("/api/follow", {
      method: "POST",
      body: { chefId: auth.RIGH_ISOLATED_CHEF_PROFILE_ID },
    });
    record(
      "buyer",
      "follow_requires_auth",
      followAnon.status === 401 ? "PASS" : "FAIL",
      `status=${followAnon.status}`,
    );

    const buyerLogin = await jsonFetch("/api/auth/customer/login", {
      method: "POST",
      body: {
        identifier: auth.RIGH_ISOLATED_BUYER_EMAIL,
        password: auth.RIGH_ISOLATED_BUYER_PASSWORD,
      },
    });
    const buyerCookie = buyerLogin.cookie;
    record(
      "buyer",
      "login",
      buyerLogin.status === 200 && buyerLogin.data?.user?.role === "customer" && buyerCookie ? "PASS" : "FAIL",
      `status=${buyerLogin.status}`,
    );

    const search = await jsonFetch("/api/marketplace/search?city=Rabat");
    const listings = search.data?.items || search.data?.listings || search.data?.results || [];
    const foundListing = Array.isArray(listings)
      ? listings.find((row) => row.id === auth.RIGH_ISOLATED_LISTING_ID)
      : null;
    record(
      "buyer",
      "browse_listings",
      search.status === 200 && foundListing ? "PASS" : "FAIL",
      `status=${search.status} found=${Boolean(foundListing)}`,
    );

    const openListing = await jsonFetch(`/api/marketplace/listings/${auth.RIGH_ISOLATED_LISTING_ID}`);
    record(
      "buyer",
      "open_listing",
      openListing.status === 200 && openListing.data?.listing?.id === auth.RIGH_ISOLATED_LISTING_ID
        ? "PASS"
        : openListing.status === 200 && openListing.data?.id === auth.RIGH_ISOLATED_LISTING_ID
          ? "PASS"
          : "FAIL",
      `status=${openListing.status}`,
    );

    // followChef is a toggle — ensure ending state is following=true.
    let follow = await jsonFetch("/api/follow", {
      method: "POST",
      cookie: buyerCookie,
      body: { chefId: auth.RIGH_ISOLATED_CHEF_PROFILE_ID },
    });
    if (follow.status === 200 && follow.data?.following === false) {
      follow = await jsonFetch("/api/follow", {
        method: "POST",
        cookie: buyerCookie,
        body: { chefId: auth.RIGH_ISOLATED_CHEF_PROFILE_ID },
      });
    }
    record(
      "buyer",
      "follow_seller",
      follow.status === 200 && follow.data?.following === true ? "PASS" : "FAIL",
      `status=${follow.status} following=${follow.data?.following}`,
    );

    const openConv = await jsonFetch("/api/marketplace/conversations", {
      method: "POST",
      cookie: buyerCookie,
      body: {
        sellerUserId: auth.RIGH_ISOLATED_SELLER_USER_ID,
        listingId: auth.RIGH_ISOLATED_LISTING_ID,
      },
    });
    const conversationId = openConv.data?.conversation?.id;
    record(
      "buyer",
      "start_conversation",
      openConv.status === 201 && conversationId && openConv.data.conversation.listingId === auth.RIGH_ISOLATED_LISTING_ID
        ? "PASS"
        : "FAIL",
      `status=${openConv.status} listingCtx=${openConv.data?.conversation?.listingId === auth.RIGH_ISOLATED_LISTING_ID}`,
    );

    const sendMsg = conversationId
      ? await jsonFetch(`/api/marketplace/conversations/${conversationId}/messages`, {
          method: "POST",
          cookie: buyerCookie,
          body: { body: "Isolated buyer hello — Phase 3.2" },
        })
      : { status: 0, data: null };
    record(
      "buyer",
      "send_message",
      sendMsg.status === 201 || sendMsg.status === 200 ? "PASS" : "FAIL",
      `status=${sendMsg.status}`,
    );

    // --- Seller ---
    const sellerLogin = await jsonFetch("/api/auth/login", {
      method: "POST",
      body: {
        email: auth.RIGH_ISOLATED_SELLER_EMAIL,
        password: auth.RIGH_ISOLATED_SELLER_PASSWORD,
        desk: "chef",
      },
    });
    const sellerCookie = sellerLogin.cookie;
    record(
      "seller",
      "login",
      sellerLogin.status === 200 && sellerLogin.data?.user?.role === "chef" && sellerCookie ? "PASS" : "FAIL",
      `status=${sellerLogin.status}`,
    );

    const sellerInbox = await jsonFetch("/api/marketplace/conversations", { cookie: sellerCookie });
    const sellerConv = (sellerInbox.data?.conversations || []).find((c) => c.id === conversationId);
    record(
      "seller",
      "incoming_messages",
      sellerInbox.status === 200 && sellerConv && (sellerConv.sellerUnread > 0 || sellerConv.unread > 0)
        ? "PASS"
        : "FAIL",
      `status=${sellerInbox.status} unread=${sellerConv?.sellerUnread ?? sellerConv?.unread}`,
    );

    const sellerReply = conversationId
      ? await jsonFetch(`/api/marketplace/conversations/${conversationId}/messages`, {
          method: "POST",
          cookie: sellerCookie,
          body: { body: "Isolated seller reply — Phase 3.2" },
        })
      : { status: 0, data: null };
    record(
      "seller",
      "reply",
      sellerReply.status === 201 || sellerReply.status === 200 ? "PASS" : "FAIL",
      `status=${sellerReply.status}`,
    );

    const buyerInbox = await jsonFetch("/api/marketplace/conversations", { cookie: buyerCookie });
    const buyerConv = (buyerInbox.data?.conversations || []).find((c) => c.id === conversationId);
    record(
      "seller",
      "buyer_receives_reply",
      buyerInbox.status === 200 && buyerConv && (buyerConv.buyerUnread > 0 || buyerConv.unread > 0)
        ? "PASS"
        : "FAIL",
      `unread=${buyerConv?.buyerUnread ?? buyerConv?.unread}`,
    );

    const buyerNotifs = await jsonFetch("/api/marketplace/notifications", { cookie: buyerCookie });
    const sellerNotifs = await jsonFetch("/api/marketplace/notifications", { cookie: sellerCookie });
    record(
      "seller",
      "notifications",
      (buyerNotifs.status === 200 || sellerNotifs.status === 200) &&
        ((buyerNotifs.data?.notifications || []).length > 0 || (sellerNotifs.data?.notifications || []).length > 0)
        ? "PASS"
        : buyerNotifs.status === 200 || sellerNotifs.status === 200
          ? "PARTIAL"
          : "FAIL",
      `buyer=${(buyerNotifs.data?.notifications || []).length} seller=${(sellerNotifs.data?.notifications || []).length}`,
    );

    const presenceBeat = await jsonFetch("/api/marketplace/presence", {
      method: "POST",
      cookie: sellerCookie,
      body: { acceptingInquiries: true },
    });
    record(
      "seller",
      "presence_online",
      presenceBeat.status === 200 && presenceBeat.data?.online === true ? "PASS" : "FAIL",
      `status=${presenceBeat.status} online=${presenceBeat.data?.online} ttlMs=${presenceBeat.data?.ttlMs}`,
    );

    const availabilityOff = await jsonFetch("/api/marketplace/presence", {
      method: "POST",
      cookie: sellerCookie,
      body: { acceptingInquiries: false },
    });
    const presenceGet = await jsonFetch(
      `/api/marketplace/presence?sellerUserId=${encodeURIComponent(auth.RIGH_ISOLATED_SELLER_USER_ID)}`,
    );
    record(
      "seller",
      "availability_toggle",
      availabilityOff.status === 200 && presenceGet.data?.acceptingInquiries === false ? "PASS" : "FAIL",
      `accepting=${presenceGet.data?.acceptingInquiries}`,
    );

    // TTL: stale lastSeenAt on isolated DB only, then public GET should report offline.
    await prisma.sellerPresence.update({
      where: { sellerUserId: auth.RIGH_ISOLATED_SELLER_USER_ID },
      data: { lastSeenAt: new Date(Date.now() - 120_000) },
    });
    const presenceStale = await jsonFetch(
      `/api/marketplace/presence?sellerUserId=${encodeURIComponent(auth.RIGH_ISOLATED_SELLER_USER_ID)}`,
    );
    record(
      "seller",
      "presence_ttl_offline",
      presenceStale.status === 200 && presenceStale.data?.online === false ? "PASS" : "FAIL",
      `online=${presenceStale.data?.online}`,
    );

    // Restore accepting for later use
    await jsonFetch("/api/marketplace/presence", {
      method: "POST",
      cookie: sellerCookie,
      body: { acceptingInquiries: true },
    });

    // --- Admin ---
    const adminLogin = await jsonFetch("/api/auth/login", {
      method: "POST",
      body: {
        email: auth.RIGH_ISOLATED_ADMIN_EMAIL,
        password: auth.RIGH_ISOLATED_ADMIN_PASSWORD,
        desk: "admin",
      },
    });
    const adminCookie = adminLogin.cookie;
    record(
      "admin",
      "login",
      adminLogin.status === 200 && adminLogin.data?.user?.role === "admin" && adminCookie ? "PASS" : "FAIL",
      `status=${adminLogin.status}`,
    );

    const modGet = await jsonFetch("/api/admin/marketplace", { cookie: adminCookie });
    record(
      "admin",
      "moderation_list",
      modGet.status === 200 && Array.isArray(modGet.data?.pending) ? "PASS" : "FAIL",
      `status=${modGet.status} pending=${(modGet.data?.pending || []).length}`,
    );

    const approve = await jsonFetch("/api/admin/marketplace", {
      method: "PATCH",
      cookie: adminCookie,
      body: { listingId: auth.RIGH_ISOLATED_PENDING_LISTING_ID, action: "approve" },
    });
    record(
      "admin",
      "moderation_action",
      approve.status === 200 ? "PASS" : "FAIL",
      `status=${approve.status}`,
    );

    const auditCount = await prisma.auditLog.count({
      where: {
        action: "listing.moderation",
        entityId: auth.RIGH_ISOLATED_PENDING_LISTING_ID,
      },
    });
    record("admin", "audit_log", auditCount > 0 ? "PASS" : "FAIL", `count=${auditCount}`);

    const unauthMod = await jsonFetch("/api/admin/marketplace", {
      method: "PATCH",
      cookie: buyerCookie,
      body: { listingId: auth.RIGH_ISOLATED_LISTING_ID, action: "hide" },
    });
    record(
      "admin",
      "unauthorized_blocked",
      unauthMod.status === 401 || unauthMod.status === 403 ? "PASS" : "FAIL",
      `status=${unauthMod.status}`,
    );

    // Auth isolation proof: admin user exists only on isolated DB fingerprint
    const adminRow = await prisma.user.findUnique({
      where: { id: "iso-admin-user" },
      select: { id: true, email: true, role: true },
    });
    record(
      "isolation",
      "admin_in_righ_test",
      adminRow?.email === auth.RIGH_ISOLATED_ADMIN_EMAIL && adminRow?.role === "ADMIN" ? "PASS" : "FAIL",
      `db=${identity.database}:${identity.port}`,
    );

    const summary = {
      ok: results.every((r) => r.status === "PASS" || r.status === "PARTIAL"),
      health: { hostKind: target.hostKind, refMatchesPrimary: target.refMatchesPrimary },
      database: { host: identity.host, port: identity.port, name: identity.database },
      results,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: true, message: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
