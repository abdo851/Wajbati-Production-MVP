/**
 * Seed ADMIN / buyer / seller ONLY into the isolated localhost test database.
 * Refuses remote/shared/production hosts. Never copies production password hashes.
 * Writes credentials to .env.test.auth.local (gitignored via .env*).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertIsolatedTestDatabase } from "../tests/integration/isolation.mjs";

/** Same salt:hex format as src/lib/db/local-store.ts hashPassword. */
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function makePassword(label) {
  return `Iso${label}${randomBytes(4).toString("hex")}!A1`;
}

const identity = assertIsolatedTestDatabase();
if (identity.host !== "127.0.0.1" && identity.host !== "localhost") {
  console.error("seed-isolated-auth refused: host is not localhost.");
  process.exit(1);
}
if (String(identity.port) !== "55432") {
  console.error("seed-isolated-auth refused: expected isolated port 55432.");
  process.exit(1);
}
if (identity.database !== "righ_test") {
  console.error("seed-isolated-auth refused: expected database righ_test.");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.CUSTOM_DATABASE_URL } },
});

const ADMIN = {
  id: "iso-admin-user",
  email: "admin@wajbati.ma",
  fullName: "Isolated Test Admin",
  password: makePassword("Admin"),
};
const BUYER = {
  id: "iso-buyer-user",
  email: "buyer.iso@righ.test",
  phone: "0699911001",
  fullName: "Isolated Test Buyer",
  password: makePassword("Buyer"),
};
const SELLER = {
  id: "iso-seller-user",
  email: "seller.iso@righ.test",
  phone: "0699911002",
  fullName: "Isolated Test Seller",
  password: makePassword("Seller"),
  chefProfileId: "iso-chef-profile",
  kitchenName: "Isolated Kitchen",
};

async function upsertUser(row) {
  await prisma.user.upsert({
    where: { id: row.id },
    create: row,
    update: {
      email: row.email,
      phone: row.phone ?? null,
      password: row.password,
      fullName: row.fullName,
      role: row.role,
      approvalStatus: row.approvalStatus,
      emailConfirmed: true,
      isActive: true,
      isDeleted: false,
    },
  });
}

try {
  await upsertUser({
    id: ADMIN.id,
    email: ADMIN.email,
    phone: null,
    password: hashPassword(ADMIN.password),
    fullName: ADMIN.fullName,
    role: "ADMIN",
    approvalStatus: "APPROVED",
    emailConfirmed: true,
    isActive: true,
    isDeleted: false,
  });

  await upsertUser({
    id: BUYER.id,
    email: BUYER.email,
    phone: BUYER.phone,
    password: hashPassword(BUYER.password),
    fullName: BUYER.fullName,
    role: "CUSTOMER",
    approvalStatus: "APPROVED",
    emailConfirmed: true,
    isActive: true,
    isDeleted: false,
  });

  await upsertUser({
    id: SELLER.id,
    email: SELLER.email,
    phone: SELLER.phone,
    password: hashPassword(SELLER.password),
    fullName: SELLER.fullName,
    role: "CHEF",
    approvalStatus: "APPROVED",
    emailConfirmed: true,
    isActive: true,
    isDeleted: false,
  });

  await prisma.chefProfile.upsert({
    where: { id: SELLER.chefProfileId },
    create: {
      id: SELLER.chefProfileId,
      userId: SELLER.id,
      kitchenName: SELLER.kitchenName,
      city: "Rabat",
      bio: "Isolated storefront for Phase 3.2 verification.",
      isActive: true,
    },
    update: {
      userId: SELLER.id,
      kitchenName: SELLER.kitchenName,
      city: "Rabat",
      isActive: true,
    },
  });

  const listingId = "iso-listing-rabat-1";
  await prisma.marketplaceListing.upsert({
    where: { id: listingId },
    create: {
      id: listingId,
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.id,
      title: "Isolated Rabat Tajine",
      description: "Isolated marketplace listing for buyer/seller journey verification in Rabat.",
      category: "tajine",
      images: [],
      kind: "PERMANENT",
      priceMode: "FIXED",
      priceMad: 65,
      availability: "AVAILABLE",
      isPublished: true,
      moderationStatus: "APPROVED",
      city: "Rabat",
      neighborhood: "Agdal",
      isDeleted: false,
      isActive: true,
    },
    update: {
      title: "Isolated Rabat Tajine",
      description: "Isolated marketplace listing for buyer/seller journey verification in Rabat.",
      isPublished: true,
      moderationStatus: "APPROVED",
      city: "Rabat",
      neighborhood: "Agdal",
      sellerUserId: SELLER.id,
      chefProfileId: SELLER.chefProfileId,
      isDeleted: false,
      isActive: true,
    },
  });

  const pendingListingId = "iso-listing-pending-1";
  await prisma.marketplaceListing.upsert({
    where: { id: pendingListingId },
    create: {
      id: pendingListingId,
      chefProfileId: SELLER.chefProfileId,
      sellerUserId: SELLER.id,
      title: "Isolated Pending Listing",
      description: "Pending moderation listing for isolated admin journey.",
      category: "home",
      images: [],
      kind: "PERMANENT",
      priceMode: "NEGOTIABLE",
      priceMad: null,
      availability: "AVAILABLE",
      isPublished: true,
      moderationStatus: "PENDING",
      city: "Temara",
      neighborhood: "Massira",
      isDeleted: false,
      isActive: true,
    },
    update: {
      title: "Isolated Pending Listing",
      moderationStatus: "PENDING",
      isPublished: true,
      city: "Temara",
      neighborhood: "Massira",
      isDeleted: false,
      isActive: true,
    },
  });

  const authFile = resolve(process.cwd(), ".env.test.auth.local");
  writeFileSync(
    authFile,
    [
      "# Isolated local auth only — never commit. Generated by seed-isolated-auth-accounts.mjs",
      `RIGH_ISOLATED_ADMIN_EMAIL=${ADMIN.email}`,
      `RIGH_ISOLATED_ADMIN_PASSWORD=${ADMIN.password}`,
      `RIGH_ISOLATED_BUYER_EMAIL=${BUYER.email}`,
      `RIGH_ISOLATED_BUYER_PASSWORD=${BUYER.password}`,
      `RIGH_ISOLATED_SELLER_EMAIL=${SELLER.email}`,
      `RIGH_ISOLATED_SELLER_PASSWORD=${SELLER.password}`,
      `RIGH_ISOLATED_SELLER_USER_ID=${SELLER.id}`,
      `RIGH_ISOLATED_CHEF_PROFILE_ID=${SELLER.chefProfileId}`,
      `RIGH_ISOLATED_LISTING_ID=${listingId}`,
      `RIGH_ISOLATED_PENDING_LISTING_ID=${pendingListingId}`,
      "",
    ].join("\n"),
    { encoding: "utf8" },
  );

  console.log(
    JSON.stringify({
      ok: true,
      host: identity.host,
      port: identity.port,
      database: identity.database,
      seeded: ["ADMIN", "CUSTOMER", "CHEF", "ChefProfile", "MarketplaceListing"],
      authFile: ".env.test.auth.local",
      note: "Passwords written only to gitignored auth file; not printed.",
    }),
  );
} finally {
  await prisma.$disconnect();
}
