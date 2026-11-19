import { readFile } from "fs/promises";
import path from "path";
import { loadGraph, saveGraph, authorizeAdminPasswordWrite } from "@/lib/db/prisma-io";
import { prisma } from "@/lib/db/prisma";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { codesMatch, newDeliveryCode, newTrackToken } from "@/lib/delivery-code";
import { financeOf, rowsOnDate, rowsThisWeek } from "@/lib/finance";
import { calculateOrderFees } from "@/lib/commission";
import { DELIVERY_FEE_MAD, DRIVER_COMMISSION_MAD, PLATFORM_COMMISSION_MAD } from "@/lib/constants";
import { assertDatabaseWriteAllowed } from "@/lib/db-guard";
import { bumpDataRevision } from "@/lib/db/data-revision";
import {
  atomicAcceptDelivery,
  atomicAdvanceDelivery,
  atomicAdminResolveOrder,
  atomicCancelOrder,
  atomicConfirmOrder,
  atomicDeliverWithOtp,
  atomicPlaceOrder,
  recordOrderStatusEvent,
} from "@/lib/db/order-writes";
import { OWNER_FINANCIAL_RULES_APPROVED, cashMealTotalMad } from "@/lib/financial-rules";
import { databaseLooksSharedOrProduction } from "@/lib/super-admin";
import { formatClosureReason } from "@/lib/orders";
import { documentsAreReady, extensionFor, requiredChefDocuments, requiredDocumentKinds } from "@/lib/documents";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { DRIVER_DEMOS } from "@/lib/driver-demos";
import { LoginFailure, StoreError } from "@/lib/errors";
import { removePrivateFile, writePrivateFile, readPrivateFile } from "@/lib/private-files";
import { messageSharesContact } from "@/lib/contact-guard";
import {
  canAccessOrderChat,
  defaultOrderChatPeer,
  orderThreadId,
  parseOrderThreadId,
  type OrderChatPeer,
} from "@/lib/order-chat";
import {
  addCasablancaDays,
  MEAL_HISTORY_DAYS,
  roundMoney,
  serviceDateInHistory,
  todayInCasablanca,
} from "@/lib/format";
import { assertTransition } from "@/lib/orders";
import type {
  ActiveDelivery,
  AdminOverview,
  AuthUser,
  ChatActor,
  ChatThread,
  CommissionSettings,
  DirectThread,
  WalletView,
  Chef as PublicChef,
  ChefApplication,
  ChefApprovalStatus,
  ChefBoard,
  ChefDocumentKind,
  ChefMeal,
  ChefOrder,
  CreateMealInput,
  CustomerAccountInput,
  CustomerOrder,
  DeliveryJob,
  DocumentKind,
  DriverAccountStatus,
  DriverApplication,
  DriverBoard,
  DriverRecord,
  GoogleIdentity,
  KitchenStat,
  MealListResponse,
  MoneySnapshot,
  OrderReceipt,
  OrderStatus,
  OrderTracking,
  PaymentMethod,
  PaymentStatus,
  PlaceOrderInput,
  PublicChefProfile,
  PublicMeal,
  RecentOrder,
  StaffAccount,
  Vehicle,
} from "@/lib/types";

type Profile = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  role: "customer" | "chef" | "admin";
  googleSub: string | null;
  emailConfirmed: boolean;
  confirmationToken: string | null;
  confirmationExpiresAt: string | null;
  avatarDataUrl: string | null;
  isActive: boolean;
  isDeleted?: boolean;
};

type Chef = {
  id: string;
  profileId: string;
  kitchenName: string;
  bio: string;
  city: string;
  isActive: boolean;
  approvalStatus: ChefApprovalStatus;
  cinStoragePath: string | null;
  autoEntrepreneurNumber: string | null;
  foodSafetyAcceptedAt: string | null;
  signatureDataUrl: string | null;
  kitchenPhotoDataUrl: string | null;
  gallery?: string[];
  averageRating?: number;
  postponedAt: string | null;
  createdAt: string;
};

type Meal = {
  id: string;
  chefId: string;
  title: string;
  description: string;
  priceMad: number;
  maxQuantity: number;
  remainingQuantity: number;
  serviceDate: string;
  isPublished: boolean;
  createdAt: string;
  photoPath: string | null;
  photoPaths?: string[];
  isDeleted?: boolean;
  isActive?: boolean;
};

type Order = {
  id: string;
  mealId: string;
  chefId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  quantity: number;
  unitPriceMad: number;
  commissionPerMealMad: number;
  totalMad: number;
  commissionMad: number;
  deliveryFeeMad: number;
  driverCommissionMad: number;
  chefServiceFee?: number | null;
  driverCommission?: number | null;
  otpHash?: string | null;
  otpExpiry?: string | null;
  otpAttempts?: number;
  refuseReason?: string | null;
  driverId: string | null;
  customerNotes: string;
  customerEmail: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryCode: string;
  trackToken: string;
  status: OrderStatus;
  rating?: number | null;
  review?: string | null;
  isDeleted?: boolean;
  isActive?: boolean;
  createdAt: string;
};

type FollowRow = {
  id: string;
  customerId: string;
  chefId: string;
  createdAt: string;
};

type StoredChefDocument = {
  id: string;
  chefId: string;
  kind: ChefDocumentKind;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  storagePath: string;
  createdAt: string;
};

type StoredDocument = {
  id: string;
  driverId: string;
  kind: DocumentKind;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  storagePath: string;
  createdAt: string;
};

type Driver = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  city: string;
  vehicle: Vehicle;
  status: DriverAccountStatus;
  googleSub: string | null;
  createdAt: string;
  emailConfirmed: boolean;
  confirmationToken: string | null;
  confirmationExpiresAt: string | null;
  signatureDataUrl: string | null;
  notes: string;
  avatarDataUrl: string | null;
  vehiclePhotoDataUrl: string | null;
  licensePhotoDataUrl: string | null;
  gallery?: string[];
  isActive: boolean;
  isDeleted?: boolean;
  postponedAt: string | null;
};

type EmailCapture = {
  email: string;
  created_at: string;
  source: string;
};

type ChatRow = {
  id: string;
  threadId: string;
  participantRole: "chef" | "driver";
  participantName: string;
  sender: "user" | "admin";
  body: string;
  createdAt: string;
};

type DirectRow = {
  id: string;
  threadId: string;
  mealId: string;
  orderId: string | null;
  customerId: string | null;
  senderRole: "customer" | "chef" | "driver";
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type WalletTxn = {
  id: string;
  ownerId: string;
  amountMad: number;
  note: "commission" | "adjustment" | "penalty";
  orderId: string | null;
  createdAt: string;
};

export type Database = {
  profiles: Profile[];
  chefs: Chef[];
  meals: Meal[];
  orders: Order[];
  drivers: Driver[];
  documents: StoredDocument[];
  chefDocuments: StoredChefDocument[];
  wallets: Wallet[];
  email_captures: EmailCapture[];
  messages: ChatRow[];
  direct_messages: DirectRow[];
  settings: CommissionSettings;
  wallet_transactions: WalletTxn[];
  follows: FollowRow[];
};

type Wallet = {
  id: string;
  profileId: string | null;
  phone: string | null;
  balanceMad: number;
  currency: "MAD";
  createdAt: string;
};

const filePath = path.join(process.cwd(), "data", "store.json");

let queue: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(hash, "hex");
  const expected = scryptSync(password, salt, actual.length || 32);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function seedDrivers(): Driver[] {
  return DRIVER_DEMOS.map((demo, index) => ({
    id: index === 0 ? "e1111111-1111-4111-8111-111111111111" : "e2222222-2222-4222-8222-222222222222",
    fullName: demo.name,
    phone: demo.phone,
    email: "",
    passwordHash: hashPassword(demo.password),
    city: demo.city,
    googleSub: null,
    emailConfirmed: true,
    confirmationToken: null,
    confirmationExpiresAt: null,
    signatureDataUrl: null,
    notes: "",
    avatarDataUrl: null,
    vehiclePhotoDataUrl: null,
    licensePhotoDataUrl: null,
    isActive: true,
    postponedAt: null,
    vehicle: demo.vehicle,
    status: demo.status,
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  }));
}

/** Empty in-memory graph for an uninitialized Prisma DB — never includes demo credentials. */
function emptyDatabase(): Database {
  return {
    profiles: [],
    chefs: [],
    meals: [],
    orders: [],
    drivers: [],
    documents: [],
    chefDocuments: [],
    wallets: [],
    email_captures: [],
    messages: [],
    direct_messages: [],
    settings: { chefCommissionMad: 1, driverCommissionMad: 1 },
    wallet_transactions: [],
    follows: [],
  };
}

/**
 * Demo/local seed is opt-in only.
 * Requires RIGH_ALLOW_DEMO_SEED=1 and a non-shared database target (localhost).
 * Never auto-seed into Supabase/Neon/production-like hosts.
 */
function demoSeedAllowed(): boolean {
  return process.env.RIGH_ALLOW_DEMO_SEED === "1" && !databaseLooksSharedOrProduction();
}

function seed(): Database {
  const today = todayInCasablanca();
  const profiles: Profile[] = DEMO_ACCOUNTS.map((account, index) => ({
    id: `a${index + 1}111111-1111-4111-8111-11111111111${index + 1}`,
    email: account.email,
    passwordHash: hashPassword(account.password),
    fullName: account.name,
    phone: null,
    role: account.role,
    googleSub: null,
    emailConfirmed: true,
    confirmationToken: null,
    confirmationExpiresAt: null,
    avatarDataUrl: null,
    isActive: true,
  }));
  const chefs: Chef[] = [
    {
      id: "b2222222-2222-4222-8222-222222222222",
      profileId: profiles[0].id,
      kitchenName: "Dar Fatima",
      bio: "Chicken rfissa with lentils and msemen, started at dawn in Ain Diab.",
      city: "Casablanca",
      isActive: true,
      approvalStatus: "approved",
      cinStoragePath: null,
      autoEntrepreneurNumber: null,
      foodSafetyAcceptedAt: null,
      signatureDataUrl: null,
      kitchenPhotoDataUrl: null,
      postponedAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "b3333333-3333-4333-8333-333333333333",
      profileId: profiles[1].id,
      kitchenName: "Youssef's Table",
      bio: "Beef tagine with prunes and toasted almonds, slow-cooked in Agdal.",
      city: "Rabat",
      isActive: true,
      approvalStatus: "approved",
      cinStoragePath: null,
      autoEntrepreneurNumber: null,
      foodSafetyAcceptedAt: null,
      signatureDataUrl: null,
      kitchenPhotoDataUrl: null,
      postponedAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "b4444444-4444-4444-8444-444444444444",
      profileId: profiles[2].id,
      kitchenName: "Khadija's Kitchen",
      bio: "Couscous steamed over seven vegetables, served from Guéliz.",
      city: "Marrakech",
      isActive: true,
      approvalStatus: "approved",
      cinStoragePath: null,
      autoEntrepreneurNumber: null,
      foodSafetyAcceptedAt: null,
      signatureDataUrl: null,
      kitchenPhotoDataUrl: null,
      postponedAt: null,
      createdAt: new Date().toISOString(),
    },
  ];
  const meals: Meal[] = [
    {
      id: "c2222222-2222-4222-8222-222222222222",
      chefId: chefs[0].id,
      title: "Chicken rfissa",
      description: "Free-range chicken, lentils, fenugreek, and a stack of msemen. The pot was started at dawn in Ain Diab.",
      priceMad: 48,
      maxQuantity: 12,
      remainingQuantity: 10,
      serviceDate: today,
      isPublished: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      photoPath: null,
    },
    {
      id: "c3333333-3333-4333-8333-333333333333",
      chefId: chefs[1].id,
      title: "Beef tagine with prunes",
      description: "Beef shoulder, prunes, toasted almonds, and sesame. Slow-cooked this morning in Agdal.",
      priceMad: 62,
      maxQuantity: 8,
      remainingQuantity: 8,
      serviceDate: today,
      isPublished: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
      photoPath: null,
    },
    {
      id: "c4444444-4444-4444-8444-444444444444",
      chefId: chefs[2].id,
      title: "Seven-vegetable couscous",
      description: "Couscous steamed over carrot, turnip, zucchini, cabbage, pumpkin, chickpeas, and a light broth.",
      priceMad: 42,
      maxQuantity: 16,
      remainingQuantity: 16,
      serviceDate: today,
      isPublished: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
      photoPath: null,
    },
  ];
  const orders: Order[] = [
    {
      id: "d2222222-2222-4222-8222-222222222222",
      mealId: meals[0].id,
      chefId: chefs[0].id,
      customerName: "Nadia Chraibi",
      customerPhone: "0661882044",
      deliveryAddress: "Attijariwafa Bank, Twin Center, Casablanca",
      quantity: 2,
      unitPriceMad: 48,
      commissionPerMealMad: PLATFORM_COMMISSION_MAD,
      totalMad: 96,
      commissionMad: PLATFORM_COMMISSION_MAD * 2,
      deliveryFeeMad: DELIVERY_FEE_MAD,
      driverCommissionMad: DRIVER_COMMISSION_MAD,
      driverId: null,
      customerNotes: "",
      customerEmail: null,
      paymentMethod: "cash",
      paymentStatus: "due_on_delivery",
      deliveryCode: "4821",
      trackToken: "seed-nadia-track-token-not-for-clients",
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    },
  ];
  return {
    profiles,
    chefs,
    meals,
    orders,
    drivers: seedDrivers(),
    documents: [],
    chefDocuments: [],
    wallets: [],
    email_captures: [],
    messages: [],
    direct_messages: [],
    settings: { chefCommissionMad: 1, driverCommissionMad: 1 },
    wallet_transactions: [],
    follows: [],
  };
}

function normalize(db: Database): boolean {
  let changed = false;
  if (!Array.isArray(db.drivers)) {
    // Never inject demo drivers during normalize — that could persist into a live DB.
    db.drivers = [];
    changed = true;
  }
  if (!Array.isArray(db.wallets)) {
    db.wallets = [];
    changed = true;
  }
  if (!Array.isArray(db.documents)) {
    db.documents = [];
    changed = true;
  }
  if (!Array.isArray(db.chefDocuments)) {
    db.chefDocuments = [];
    changed = true;
  }
  for (const chef of db.chefs) {
    if (chef.approvalStatus !== "pending" && chef.approvalStatus !== "approved" && chef.approvalStatus !== "rejected") {
      chef.approvalStatus = "approved";
      changed = true;
    }
    if (chef.cinStoragePath === undefined) {
      chef.cinStoragePath = null;
      changed = true;
    }
    if (chef.autoEntrepreneurNumber === undefined) {
      chef.autoEntrepreneurNumber = null;
      changed = true;
    }
    if (chef.foodSafetyAcceptedAt === undefined) {
      chef.foodSafetyAcceptedAt = null;
      changed = true;
    }
    if (chef.signatureDataUrl === undefined) {
      chef.signatureDataUrl = null;
      changed = true;
    }
    if (chef.kitchenPhotoDataUrl === undefined) {
      chef.kitchenPhotoDataUrl = null;
      changed = true;
    }
  }
  for (const meal of db.meals) {
    if (meal.photoPath === undefined) {
      meal.photoPath = null;
      changed = true;
    }
  }
  if (!Array.isArray(db.email_captures)) {
    db.email_captures = [];
    changed = true;
  }
  if (!Array.isArray(db.messages)) {
    db.messages = [];
    changed = true;
  }
  if (!Array.isArray(db.direct_messages)) {
    db.direct_messages = [];
    changed = true;
  }
  if (!db.settings || typeof db.settings.chefCommissionMad !== "number" || typeof db.settings.driverCommissionMad !== "number") {
    db.settings = { chefCommissionMad: 1, driverCommissionMad: 1 };
    changed = true;
  }
  if (!Array.isArray(db.wallet_transactions)) {
    db.wallet_transactions = [];
    changed = true;
  }
  if (!Array.isArray(db.follows)) {
    db.follows = [];
    changed = true;
  }
  for (const profile of db.profiles) {
    if (profile.isActive === undefined) {
      profile.isActive = true;
      changed = true;
    }
  }
  for (const driver of db.drivers) {
    if (driver.isActive === undefined) {
      driver.isActive = true;
      changed = true;
    }
    if (driver.postponedAt === undefined) {
      driver.postponedAt = null;
      changed = true;
    }
  }
  for (const chef of db.chefs) {
    if (chef.postponedAt === undefined) {
      chef.postponedAt = null;
      changed = true;
    }
    if (!chef.createdAt) {
      chef.createdAt = chef.foodSafetyAcceptedAt ?? new Date(0).toISOString();
      changed = true;
    }
  }
  const master = DEMO_ACCOUNTS.find((account) => account.role === "admin");
  if (master) {
    for (const profile of db.profiles) {
      if (profile.role === "admin" && profile.email.toLowerCase() !== master.email.toLowerCase()) {
        profile.role = "customer";
        changed = true;
      }
    }
    const profile = db.profiles.find((item) => item.email.toLowerCase() === master.email.toLowerCase());
    if (profile) {
      if (profile.role !== "admin") {
        profile.role = "admin";
        changed = true;
      }
      // Never overwrite an existing admin password hash during normalize/reads.
      // Explicit admin password changes go through authorizeAdminPasswordWrite() only.
    }
  }
  for (const profile of db.profiles) {
    if (profile.googleSub === undefined) {
      profile.googleSub = null;
      changed = true;
    }
    if (profile.emailConfirmed === undefined) {
      profile.emailConfirmed = true;
      changed = true;
    }
    if (profile.confirmationToken === undefined) {
      profile.confirmationToken = null;
      changed = true;
    }
    if (profile.confirmationExpiresAt === undefined) {
      profile.confirmationExpiresAt = null;
      changed = true;
    }
    if (profile.avatarDataUrl === undefined) {
      profile.avatarDataUrl = null;
      changed = true;
    }
  }
  for (const driver of db.drivers) {
    if (driver.email === undefined) {
      driver.email = "";
      changed = true;
    }
    if (driver.googleSub === undefined) {
      driver.googleSub = null;
      changed = true;
    }
    if (driver.emailConfirmed === undefined) {
      driver.emailConfirmed = true;
      changed = true;
    }
    if (driver.confirmationToken === undefined) {
      driver.confirmationToken = null;
      changed = true;
    }
    if (driver.confirmationExpiresAt === undefined) {
      driver.confirmationExpiresAt = null;
      changed = true;
    }
    if (driver.signatureDataUrl === undefined) {
      driver.signatureDataUrl = null;
      changed = true;
    }
    if (driver.notes === undefined) {
      driver.notes = "";
      changed = true;
    }
    if (driver.avatarDataUrl === undefined) {
      driver.avatarDataUrl = null;
      changed = true;
    }
    if (driver.vehiclePhotoDataUrl === undefined) {
      driver.vehiclePhotoDataUrl = null;
      changed = true;
    }
    if (driver.licensePhotoDataUrl === undefined) {
      driver.licensePhotoDataUrl = null;
      changed = true;
    }
    if (driver.vehicle !== "bike" && driver.vehicle !== "motorbike" && driver.vehicle !== "car") {
      driver.vehicle = "motorbike";
      changed = true;
    }
  }
  for (const order of db.orders) {
    if (order.driverId === undefined) {
      order.driverId = null;
      changed = true;
    }
    if (order.deliveryFeeMad === undefined) {
      // Do not backfill the frozen/unapproved DELIVERY_FEE_MAD constant.
      order.deliveryFeeMad = 0;
      changed = true;
    }
    if (order.driverCommissionMad === undefined) {
      // Do not backfill frozen/unapproved commission constants.
      order.driverCommissionMad = 0;
      changed = true;
    }
    if (order.customerNotes === undefined) {
      order.customerNotes = "";
      changed = true;
    }
    if (order.customerEmail === undefined) {
      order.customerEmail = null;
      changed = true;
    }
    if (order.paymentMethod === undefined) {
      order.paymentMethod = "cash";
      changed = true;
    }
    if (order.paymentStatus === undefined) {
      order.paymentStatus = "due_on_delivery";
      changed = true;
    }
    if (!/^\d{4}$/.test(order.deliveryCode ?? "")) {
      order.deliveryCode = newDeliveryCode();
      changed = true;
    }
    if (!order.trackToken) {
      order.trackToken = newTrackToken();
      changed = true;
    }
  }
  return changed;
}

const READ_CACHE_MS = 2000;
let readCache: { at: number; db: Database } | null = null;

function rememberDb(db: Database) {
  readCache = { at: Date.now(), db: structuredClone(db) };
}

async function safeStatusEvent(input: {
  orderId: string;
  fromStatus: string;
  toStatus: string;
  actorRole: string;
  actorId: string | null;
  reason: string | null;
}) {
  try {
    await recordOrderStatusEvent(input);
  } catch (error) {
    console.warn("[order-event]", error instanceof Error ? error.message : "unknown");
  }
}

async function loadGraphWithRetry() {
  let lastError: unknown;
  // Keep retries short — long backoff under pool exhaustion makes EMAXCONNSESSION worse.
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      return await loadGraph();
    } catch (error) {
      lastError = error;
      if (attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError;
}

async function readDb(fresh = false): Promise<{ db: Database; created: boolean; migrated: boolean }> {
  if (!fresh && readCache && Date.now() - readCache.at < READ_CACHE_MS) {
    return { db: structuredClone(readCache.db), created: false, migrated: false };
  }
  let existing: Database | null = null;
  try {
    existing = await loadGraphWithRetry();
  } catch (error) {
    console.error("LOAD_GRAPH", error instanceof Error ? error.message : "unknown");
    throw new StoreError("The order book could not be read.", 500);
  }
  if (existing) {
    const migrated = normalize(existing);
    if (!migrated) rememberDb(existing);
    return { db: existing, created: false, migrated };
  }
  // Empty Prisma DB: do not silently seed demo accounts into the live database.
  if (!demoSeedAllowed()) {
    const empty = emptyDatabase();
    rememberDb(empty);
    return { db: empty, created: false, migrated: false };
  }
  try {
    const raw = await readFile(filePath, "utf8");
    const db = JSON.parse(raw) as Database;
    return { db, created: true, migrated: normalize(db) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { db: seed(), created: true, migrated: false };
    }
    throw new StoreError("The order book could not be read.", 500);
  }
}

async function writeDb(db: Database) {
  assertDatabaseWriteAllowed("prisma");
  try {
    await saveGraph(db);
    rememberDb(db);
  } catch (error) {
    // Stale-graph rejection or failed rewrite: drop process cache so the next read reloads DB.
    readCache = null;
    throw error;
  }
}

/**
 * Cross-instance mutex backed by a real table row — safe under PgBouncer/Neon pooler
 * (unlike session advisory locks, which can leak across pooled connections).
 * Guarded with the same shared-DB policy as saveGraph (raw SQL must not bypass it).
 */
async function acquireDbMutex(name: string, timeoutMs = 10_000): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS app_mutex (name text primary key, granted_at timestamptz)`;
  const start = Date.now();
  for (;;) {
    const created = await prisma.$executeRaw`INSERT INTO app_mutex (name, granted_at) VALUES (${name}, now()) ON CONFLICT (name) DO NOTHING`;
    if (Number(created) > 0) return;
    if (Date.now() - start > timeoutMs) throw new StoreError("تعذر تنفيذ العملية، حاول مجدداً.", 409);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function releaseDbMutex(name: string) {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$executeRaw`DELETE FROM app_mutex WHERE name = ${name}`.catch(() => undefined);
}

/** Cross-instance critical-section guard for check+mutate operations on serverless. */
async function withAdvisoryLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  await acquireDbMutex(key);
  try {
    return await run();
  } finally {
    await releaseDbMutex(key);
  }
}

async function withDb<T>(fn: (db: Database) => T | Promise<T>, persist: boolean): Promise<T> {
  return locked(async () => {
    const loaded = await readDb(persist);
    // Only persist a brand-new seed graph immediately. Do not rewrite Neon/Postgres
    // solely because normalize() marked field backfills on a read-only path.
    if (loaded.created) await writeDb(loaded.db);
    const result = await fn(loaded.db);
    if (persist) await writeDb(loaded.db);
    return result;
  });
}

function chefFor(db: Database, chefId: string) {
  return db.chefs.find((chef) => chef.id === chefId && chef.isActive);
}

function mealPaths(meal: Meal): string[] {
  if (meal.photoPaths && meal.photoPaths.length > 0) return meal.photoPaths;
  return meal.photoPath ? [meal.photoPath] : [];
}

function mealIsVisible(meal: Meal): boolean {
  return meal.isDeleted !== true && meal.isActive !== false;
}

function toPublicMeal(db: Database, meal: Meal): PublicMeal {
  const chef = db.chefs.find((item) => item.id === meal.chefId);
  const paths = mealPaths(meal);
  return {
    id: meal.id,
    chefId: meal.chefId,
    title: meal.title,
    description: meal.description,
    priceMad: meal.priceMad,
    maxQuantity: meal.maxQuantity,
    remainingQuantity: meal.remainingQuantity,
    serviceDate: meal.serviceDate,
    kitchenName: chef?.kitchenName ?? "Kitchen",
    city: chef?.city ?? "",
    photoUrl: paths.length > 0 ? `/api/meals/${meal.id}/photo?i=0` : null,
    photoUrls: paths.map((_, index) => `/api/meals/${meal.id}/photo?i=${index}`),
  };
}

function refreshChefAverage(db: Database, chefId: string) {
  const chef = db.chefs.find((item) => item.id === chefId);
  if (!chef) return;
  const rated = db.orders.filter((order) => order.chefId === chefId && typeof order.rating === "number" && order.rating >= 1);
  if (rated.length === 0) {
    chef.averageRating = 0;
    return;
  }
  const total = rated.reduce((sum, order) => sum + (order.rating ?? 0), 0);
  chef.averageRating = roundMoney(total / rated.length);
}

function toChefMeal(db: Database, meal: Meal): ChefMeal {
  return { ...toPublicMeal(db, meal), isPublished: meal.isPublished };
}

function toChefOrder(db: Database, order: Order): ChefOrder {
  const meal = db.meals.find((item) => item.id === order.mealId);
  return {
    id: order.id,
    mealTitle: meal?.title ?? "Meal",
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    quantity: order.quantity,
    unitPriceMad: order.unitPriceMad,
    totalMad: order.totalMad,
    commissionMad: order.commissionMad,
    netMad: roundMoney(order.totalMad - order.commissionMad),
    customerNotes: order.customerNotes,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt,
  };
}

function toRecent(db: Database, order: Order): RecentOrder {
  const chef = db.chefs.find((item) => item.id === order.chefId);
  return { ...toChefOrder(db, order), kitchenName: chef?.kitchenName ?? "Kitchen" };
}

function snapshot(orders: Order[]): MoneySnapshot {
  const portions = orders.reduce((sum, order) => sum + order.quantity, 0);
  const gross = orders.reduce((sum, order) => sum + order.totalMad, 0);
  const commission = orders.reduce((sum, order) => sum + order.commissionMad, 0);
  return {
    orders: orders.length,
    portions,
    grossRevenueMad: roundMoney(gross),
    commissionMad: roundMoney(commission),
    chefPayoutMad: roundMoney(gross - commission),
  };
}

function mapUser(db: Database, profile: Profile): AuthUser {
  const linked = db.chefs.filter((item) => item.profileId === profile.id);
  const chef = linked.find((item) => item.isActive) ?? linked[0];
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
    chefId: chef?.id ?? null,
    kitchenName: chef?.kitchenName ?? null,
    driverId: null,
    driverStatus: null,
    city: chef?.city ?? null,
    phone: profile.phone,
    vehicle: null,
    documentsReady: null,
    chefApprovalStatus: chef?.approvalStatus ?? null,
    approvalStatus: chef?.approvalStatus ?? null,
    emailConfirmed: profile.emailConfirmed,
    avatarDataUrl: profile.avatarDataUrl,
    bio: chef?.bio ?? "",
    gallery: chef?.gallery ?? [],
  };
}

function mapDriver(db: Database, driver: Driver): AuthUser {
  return {
    id: driver.id,
    email: driver.email,
    fullName: driver.fullName,
    role: "driver",
    chefId: null,
    kitchenName: null,
    driverId: driver.id,
    driverStatus: driver.status,
    city: driver.city,
    phone: driver.phone,
    vehicle: driver.vehicle,
    documentsReady: documentsAreReady(driver.vehicle, driver.email, documentKinds(db, driver.id)),
    chefApprovalStatus: null,
    approvalStatus: null,
    emailConfirmed: driver.emailConfirmed,
    avatarDataUrl: driver.avatarDataUrl,
    bio: driver.notes,
    gallery: driver.gallery ?? [],
  };
}

function balanceOf(db: Database, ownerId: string): number {
  return db.wallets.find((item) => item.profileId === ownerId)?.balanceMad ?? 0;
}

function settingsOf(db: Database): CommissionSettings {
  return db.settings ?? { chefCommissionMad: 1, driverCommissionMad: 1 };
}

function alreadyCharged(db: Database, ownerId: string, orderId: string) {
  return db.wallet_transactions.some((item) => item.ownerId === ownerId && item.orderId === orderId && item.note === "commission");
}

/**
 * Financial settlement only — never a prerequisite for recording physical delivery.
 * When owner rules are unapproved, delivery stays `delivered` and wallets are untouched.
 * Idempotent via alreadyCharged; does not create zero-value settlement rows.
 */
function trySettleDeliveryCommissions(db: Database, order: Order) {
  if (order.status !== "delivered") return;
  if (!OWNER_FINANCIAL_RULES_APPROVED) return;
  const fees = calculateOrderFees(order.unitPriceMad, order.quantity);
  if (fees.chefServiceFee <= 0 && fees.driverCommission <= 0) return;
  order.commissionPerMealMad = fees.chefPerPortionMad;
  order.commissionMad = fees.chefServiceFee;
  order.driverCommissionMad = fees.driverCommission;
  order.chefServiceFee = fees.chefServiceFee;
  order.driverCommission = fees.driverCommission;
  const chef = db.chefs.find((item) => item.id === order.chefId);
  if (chef && fees.chefServiceFee > 0 && !alreadyCharged(db, chef.profileId, order.id)) {
    moveWallet(db, chef.profileId, -fees.chefServiceFee, "commission", order.id);
  }
  if (order.driverId && fees.driverCommission > 0 && !alreadyCharged(db, order.driverId, order.id)) {
    moveWallet(db, order.driverId, -fees.driverCommission, "commission", order.id);
  }
}

/** No automatic refusal penalty is owner-approved — do not invent wallet rows. */
function logRefusalPenalty(_db: Database, _order: Order) {
  return;
}

function assertDeliveryCode(order: Order, given: string) {
  if (order.otpHash) {
    if (order.otpExpiry && new Date(order.otpExpiry).getTime() < Date.now()) {
      throw new StoreError("انتهت صلاحية رمز التسليم.", 409);
    }
    if ((order.otpAttempts ?? 0) >= 3) {
      throw new StoreError("تم تجاوز عدد محاولات الرمز.", 409);
    }
    order.otpAttempts = (order.otpAttempts ?? 0) + 1;
    if (!verifyPassword(given, order.otpHash)) {
      throw new StoreError("That code does not match.", 409);
    }
    return;
  }
  if (!codesMatch(order.deliveryCode, given)) {
    throw new StoreError("That code does not match.", 409);
  }
}

function assertWalletOpen(db: Database, ownerId: string) {
  if (balanceOf(db, ownerId) <= 0) {
    throw new StoreError("Your wallet balance is empty. Top it up before publishing or accepting orders.", 403);
  }
}

async function assertPrismaWalletOpen(ownerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { walletBalance: true },
  });
  if (!user || user.walletBalance <= 0) {
    throw new StoreError("Your wallet balance is empty. Top it up before publishing or accepting orders.", 403);
  }
}

function chefMealFromRow(
  meal: {
    id: string;
    chefId: string;
    title: string;
    description: string;
    price: number;
    quantity: number;
    remainingQuantity: number;
    serviceDate: Date;
    isPublished: boolean;
    imageUrl: string | null;
    images: string[];
  },
  kitchenName: string,
  city: string,
): ChefMeal {
  const paths = meal.images?.length ? meal.images : meal.imageUrl ? [meal.imageUrl] : [];
  return {
    id: meal.id,
    chefId: meal.chefId,
    title: meal.title,
    description: meal.description,
    priceMad: meal.price,
    maxQuantity: meal.quantity,
    remainingQuantity: meal.remainingQuantity,
    serviceDate: meal.serviceDate.toISOString().slice(0, 10),
    kitchenName,
    city,
    photoUrl: paths.length > 0 ? `/api/meals/${meal.id}/photo?i=0` : null,
    photoUrls: paths.map((_, index) => `/api/meals/${meal.id}/photo?i=${index}`),
    isPublished: meal.isPublished,
  };
}

function moveWallet(db: Database, ownerId: string, amountMad: number, note: WalletTxn["note"], orderId: string | null) {
  let wallet = db.wallets.find((item) => item.profileId === ownerId);
  if (!wallet) {
    wallet = {
      id: randomUUID(),
      profileId: ownerId,
      phone: null,
      balanceMad: 0,
      currency: "MAD",
      createdAt: new Date().toISOString(),
    };
    db.wallets.push(wallet);
  }
  wallet.balanceMad = roundMoney(wallet.balanceMad + amountMad);
  db.wallet_transactions.push({
    id: randomUUID(),
    ownerId,
    amountMad,
    note,
    orderId,
    createdAt: new Date().toISOString(),
  });
}

function assertThreadAccess(db: Database, actor: ChatActor, threadId: string) {
  const orderThread = parseOrderThreadId(threadId);
  if (orderThread) {
    const order = db.orders.find((item) => item.id === orderThread.orderId);
    if (!order || !canAccessOrderChat(actor, order, orderThread.peer)) {
      throw new StoreError("Sign in to continue.", 403);
    }
    return;
  }
  const match = /^meal:([^:]+):customer:([^:]+)$/.exec(threadId);
  if (!match) throw new StoreError("That conversation could not be found.", 404);
  const meal = db.meals.find((item) => item.id === match[1]);
  if (!meal) throw new StoreError("That meal could not be found.", 404);
  if (actor.role === "customer" && actor.id === match[2]) return;
  if (actor.role === "chef" && actor.chefId === meal.chefId) return;
  throw new StoreError("Sign in to continue.", 403);
}

type DirectThreadQuery = {
  mealId: string | null;
  orderId: string | null;
  threadId: string | null;
  peer?: OrderChatPeer | null;
};

function resolveDirectThread(db: Database, actor: ChatActor, query: DirectThreadQuery) {
  if (query.threadId) {
    assertThreadAccess(db, actor, query.threadId);
    return query.threadId;
  }
  if (query.orderId) {
    const order = db.orders.find((item) => item.id === query.orderId);
    if (!order) throw new StoreError("That order could not be found.", 404);
    const peer = query.peer ?? defaultOrderChatPeer(actor.role);
    if (!canAccessOrderChat(actor, order, peer)) throw new StoreError("Sign in to continue.", 403);
    return orderThreadId(order.id, peer);
  }
  if (query.mealId) {
    const meal = db.meals.find((item) => item.id === query.mealId);
    if (!meal) throw new StoreError("That meal could not be found.", 404);
    if (actor.role !== "customer") throw new StoreError("Sign in to continue.", 403);
    return `meal:${meal.id}:customer:${actor.id}`;
  }
  throw new StoreError("That conversation could not be found.", 404);
}

function toDirectThread(db: Database, actor: ChatActor, threadId: string): DirectThread {
  const messages = db.direct_messages
    .filter((item) => item.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let mealId = messages[0]?.mealId ?? "";
  let orderId: string | null = messages[0]?.orderId ?? null;
  let title = "";
  let peerName = "";
  if (threadId.startsWith("meal:")) {
    mealId = threadId.split(":")[1] ?? mealId;
    const meal = db.meals.find((item) => item.id === mealId);
    const chef = meal ? db.chefs.find((item) => item.id === meal.chefId) : undefined;
    title = meal?.title ?? "";
    peerName =
      actor.role === "chef"
        ? (messages.find((item) => item.senderRole === "customer")?.senderName ?? "")
        : (chef?.kitchenName ?? "");
  } else {
    const parsed = parseOrderThreadId(threadId);
    if (parsed) {
      orderId = parsed.orderId;
      const order = db.orders.find((item) => item.id === orderId);
      const meal = order ? db.meals.find((item) => item.id === order.mealId) : undefined;
      mealId = order?.mealId ?? mealId;
      title = meal?.title ?? "";
      if (parsed.peer === "chef") {
        const chef = order ? db.chefs.find((item) => item.id === order.chefId) : undefined;
        peerName =
          actor.role === "chef"
            ? (order?.customerName ?? "")
            : (chef?.kitchenName ?? "");
      } else if (actor.role === "driver") {
        peerName = order?.customerName ?? "";
      } else {
        peerName = db.drivers.find((item) => item.id === order?.driverId)?.fullName ?? "";
      }
    }
  }
  return {
    threadId,
    mealId,
    orderId,
    title,
    peerName,
    messages: messages.map((item) => ({
      id: item.id,
      senderRole: item.senderRole,
      senderName: item.senderName,
      body: item.body,
      createdAt: item.createdAt,
      mine: item.senderId === actor.id,
    })),
  };
}

function threadFor(db: Database, threadId: string): ChatThread | null {
  const messages = db.messages
    .filter((item) => item.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = messages[messages.length - 1];
  if (!last) return null;
  return {
    threadId,
    participantRole: last.participantRole,
    participantName: last.participantName,
    lastBody: last.body,
    lastAt: last.createdAt,
    messages,
  };
}

function toPendingChef(db: Database, chef: Chef): PublicChef {
  const profile = db.profiles.find((item) => item.id === chef.profileId);
  const cin = db.chefDocuments.find((item) => item.chefId === chef.id && item.kind === "cin_front");
  return {
    id: chef.id,
    ownerId: chef.profileId,
    kitchenName: chef.kitchenName,
    city: chef.city,
    fullName: profile?.fullName ?? chef.kitchenName,
    phone: profile?.phone ?? null,
    bio: chef.bio,
    cin_storage_path: chef.cinStoragePath,
    auto_entrepreneur_number: chef.autoEntrepreneurNumber,
    food_safety_accepted_at: chef.foodSafetyAcceptedAt,
    approval_status: chef.approvalStatus,
    cinDocumentId: cin?.id ?? null,
    signature_data_url: chef.signatureDataUrl,
    documents: db.chefDocuments
      .filter((item) => item.chefId === chef.id)
      .map((item) => ({ id: item.id, kind: item.kind })),
    is_active: chef.isActive && profile?.isActive !== false,
    postponed: Boolean(chef.postponedAt),
    balanceMad: balanceOf(db, chef.profileId),
    createdAt: chef.createdAt,
  };
}

function documentKinds(db: Database, driverId: string): DocumentKind[] {
  return db.documents.filter((item) => item.driverId === driverId).map((item) => item.kind);
}

function toDriverRecord(db: Database, driver: Driver): DriverRecord {
  const documents = db.documents
    .filter((item) => item.driverId === driver.id)
    .map((item) => ({ id: item.id, kind: item.kind, contentType: item.contentType }));
  return {
    id: driver.id,
    ownerId: driver.id,
    fullName: driver.fullName,
    email: driver.email,
    phone: driver.phone,
    city: driver.city,
    vehicle: driver.vehicle,
    status: driver.status,
    documents,
    documentsReady: documentsAreReady(driver.vehicle, driver.email, documents.map((item) => item.kind)),
    createdAt: driver.createdAt,
    signature_data_url: driver.signatureDataUrl,
    notes: driver.notes,
    is_active: driver.isActive,
    postponed: Boolean(driver.postponedAt),
    balanceMad: balanceOf(db, driver.id),
  };
}

function toJob(db: Database, order: Order): DeliveryJob {
  const meal = db.meals.find((item) => item.id === order.mealId);
  const chef = db.chefs.find((item) => item.id === order.chefId);
  return {
    id: order.id,
    mealTitle: meal?.title ?? "Meal",
    kitchenName: chef?.kitchenName ?? "Kitchen",
    city: chef?.city ?? "",
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat ?? null,
    deliveryLng: order.deliveryLng ?? null,
    quantity: order.quantity,
    status: order.status,
    deliveryFeeMad: order.deliveryFeeMad,
    driverCommissionMad: order.driverCommissionMad,
    driverNetMad: roundMoney(order.deliveryFeeMad - order.driverCommissionMad),
    customerNotes: order.customerNotes,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
  };
}

function ordersForPhone(db: Database, phone: string): CustomerOrder[] {
  return db.orders
    .filter((order) => onlyDigits(order.customerPhone) === phone)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map((order) => {
      const meal = db.meals.find((item) => item.id === order.mealId);
      const chef = db.chefs.find((item) => item.id === order.chefId);
      return {
        id: order.id,
        mealTitle: meal?.title ?? "Meal",
        kitchenName: chef?.kitchenName ?? "Kitchen",
        deliveryAddress: order.deliveryAddress,
        quantity: order.quantity,
        totalMad: order.totalMad,
        deliveryFeeMad: order.deliveryFeeMad,
        customerNotes: order.customerNotes,
        status: order.status,
        deliveryCode: order.deliveryCode,
        trackToken: order.trackToken,
        createdAt: order.createdAt,
      };
    });
}

function requireDriver(db: Database, driverId: string): Driver {
  const driver = db.drivers.find((item) => item.id === driverId);
  if (!driver) throw new StoreError("That driver could not be found.", 404);
  return driver;
}

const DUMMY_HASH = `${"ab".repeat(16)}:${"cd".repeat(32)}`;

function profileRoleFromEnum(role: string): "customer" | "chef" | "admin" {
  if (role === "CHEF") return "chef";
  if (role === "ADMIN") return "admin";
  return "customer";
}

function approvalFromEnum(status: string): "pending" | "approved" | "rejected" {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

/**
 * Authenticate against Prisma User rows directly.
 * Avoids full-graph loadCache / stale-DB singleton issues for login.
 */
export async function authenticateLocal(email: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
      isDeleted: false,
      role: { not: "DRIVER" },
    },
    include: { chefProfile: true },
  });
  const ok = verifyPassword(password, user?.password ?? DUMMY_HASH);
  if (!user || !user.isActive) throw new LoginFailure("user not found");
  if (!ok) throw new LoginFailure("password mismatch");

  const role = profileRoleFromEnum(user.role);
  if (role === "chef") {
    const kitchen = user.chefProfile;
    const approval = approvalFromEnum(user.approvalStatus);
    if (approval === "pending" || approval === "rejected") {
      throw new StoreError("Your account is under review. You cannot publish meals until approved.", 403);
    }
    if (!kitchen || !kitchen.isActive || approval !== "approved") {
      throw new LoginFailure("user not found");
    }
  }
  if (user.emailConfirmed === false && role !== "chef") {
    throw new StoreError("Please confirm your email first.", 403);
  }

  const kitchen = user.chefProfile;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role,
    chefId: kitchen?.id ?? null,
    kitchenName: kitchen?.kitchenName ?? null,
    driverId: null,
    driverStatus: null,
    city: kitchen?.city ?? null,
    phone: user.phone,
    vehicle: null,
    documentsReady: null,
    chefApprovalStatus: kitchen ? approvalFromEnum(user.approvalStatus) : null,
    approvalStatus: kitchen ? approvalFromEnum(user.approvalStatus) : null,
    emailConfirmed: user.emailConfirmed,
    avatarDataUrl: user.avatarDataUrl,
    bio: kitchen?.bio ?? "",
    gallery: kitchen?.gallery ?? [],
  };
}

export async function findLocalUser(userId: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const profile = db.profiles.find((item) => item.id === userId);
    if (profile) return mapUser(db, profile);
    const driver = db.drivers.find((item) => item.id === userId);
    return driver ? mapDriver(db, driver) : null;
  }, false);
}

export async function findLocalCustomerByEmail(email: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const profile = db.profiles.find(
      (item) => item.role === "customer" && item.email.toLowerCase() === email.trim().toLowerCase(),
    );
    return profile ? mapUser(db, profile) : null;
  }, false);
}

export async function updateLocalAdminCredentials(
  userId: string,
  changes: { email?: string; password?: string },
): Promise<void> {
  if (changes.password) authorizeAdminPasswordWrite();
  return withDb((db) => {
    const profile = db.profiles.find((item) => item.id === userId && item.role === "admin");
    if (!profile) throw new StoreError("That admin account could not be found.", 404);
    const email = changes.email?.trim().toLowerCase();
    if (email) {
      const taken = db.profiles.some((item) => item.id !== userId && item.email.toLowerCase() === email);
      if (taken) throw new StoreError("That email is already in use.", 409);
      profile.email = email;
    }
    if (changes.password) {
      profile.passwordHash = hashPassword(changes.password);
    }
  }, true);
}

export async function authenticateLocalDriver(identifier: string, password: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const driver = db.drivers.find((item) => item.phone === identifier || item.email === identifier);
    const ok = verifyPassword(password, driver?.passwordHash ?? DUMMY_HASH);
    if (!driver || !ok) return null;
    if (driver.status === "approved") return mapDriver(db, driver);
    throw new StoreError("Your application is still waiting for approval.", 403);
  }, false);
}

function freshConfirmation() {
  return {
    emailConfirmed: false,
    confirmationToken: randomUUID(),
    confirmationExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
}

export async function registerLocalDriver(
  input: DriverApplication,
  googleSub: string | null = null,
): Promise<{ user: AuthUser; confirmationToken: string }> {
  return withDb((db) => {
    assertIdentityFree(db, input.email, input.phone);
    const confirmation = freshConfirmation();
    const driver: Driver = {
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: hashPassword(input.password),
      city: input.city,
      vehicle: input.vehicle,
      status: "pending",
      googleSub,
      createdAt: new Date().toISOString(),
      emailConfirmed: false,
      confirmationToken: confirmation.confirmationToken,
      confirmationExpiresAt: confirmation.confirmationExpiresAt,
      signatureDataUrl: input.signature,
      notes: "",
      avatarDataUrl: null,
      vehiclePhotoDataUrl: null,
      licensePhotoDataUrl: null,
      isActive: true,
      postponedAt: null,
    };
    db.drivers.push(driver);
    return { user: mapDriver(db, driver), confirmationToken: confirmation.confirmationToken };
  }, true);
}

export async function registerLocalChef(
  input: ChefApplication,
  googleSub: string | null = null,
): Promise<{ user: AuthUser; confirmationToken: string }> {
  return withDb((db) => {
    assertIdentityFree(db, input.email, input.phone);
    const confirmation = freshConfirmation();
    const profile: Profile = {
      id: randomUUID(),
      email: input.email,
      passwordHash: hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone,
      role: "chef",
      googleSub,
      emailConfirmed: false,
      confirmationToken: confirmation.confirmationToken,
      confirmationExpiresAt: confirmation.confirmationExpiresAt,
      avatarDataUrl: null,
      isActive: true,
    };
    db.profiles.push(profile);
    db.chefs.push({
      id: randomUUID(),
      profileId: profile.id,
      kitchenName: input.kitchenName,
      bio: "",
      city: input.city,
      isActive: true,
      approvalStatus: "pending",
      cinStoragePath: null,
      autoEntrepreneurNumber: input.autoEntrepreneurNumber,
      signatureDataUrl: input.signature,
      kitchenPhotoDataUrl: null,
      foodSafetyAcceptedAt: new Date().toISOString(),
      postponedAt: null,
      createdAt: new Date().toISOString(),
    });
    return { user: mapUser(db, profile), confirmationToken: confirmation.confirmationToken };
  }, true);
}

export async function registerLocalCustomer(input: CustomerAccountInput): Promise<AuthUser> {
  return withDb((db) => {
    assertIdentityFree(db, input.email, input.phone);
    const profile: Profile = {
      id: randomUUID(),
      email: input.email,
      passwordHash: hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone,
      role: "customer",
      googleSub: null,
      emailConfirmed: true,
      confirmationToken: null,
      confirmationExpiresAt: null,
      avatarDataUrl: null,
      isActive: true,
    };
    db.profiles.push(profile);
    return mapUser(db, profile);
  }, true);
}

export async function authenticateLocalCustomer(identifier: string, password: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const profile = db.profiles.find(
      (item) => item.role === "customer" && (item.phone === identifier || (item.email !== "" && item.email === identifier)),
    );
    const ok = verifyPassword(password, profile?.passwordHash ?? DUMMY_HASH);
    if (!profile || !ok) return null;
    if (profile.emailConfirmed === false) {
      throw new StoreError("Please confirm your email first.", 403);
    }
    return mapUser(db, profile);
  }, false);
}

export async function updateLocalCustomer(userId: string, input: { fullName: string; phone: string }): Promise<AuthUser> {
  assertDatabaseWriteAllowed("prisma");
  const existing = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER", isDeleted: false },
    select: { id: true, email: true, fullName: true, phone: true, emailConfirmed: true, avatarDataUrl: true },
  });
  if (!existing) throw new StoreError("Sign in to continue.", 401);
  const phoneTaken = await prisma.user.findFirst({
    where: { phone: input.phone, NOT: { id: userId } },
    select: { id: true },
  });
  if (phoneTaken) throw new StoreError("That phone is already registered.", 409);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { fullName: input.fullName, phone: input.phone },
  });
  await bumpDataRevision(prisma);
  readCache = null;
  return {
    id: updated.id,
    email: updated.email,
    fullName: updated.fullName,
    role: "customer",
    chefId: null,
    kitchenName: null,
    driverId: null,
    driverStatus: null,
    city: null,
    phone: updated.phone,
    vehicle: null,
    documentsReady: null,
    chefApprovalStatus: null,
    approvalStatus: null,
    emailConfirmed: updated.emailConfirmed,
    avatarDataUrl: updated.avatarDataUrl,
    bio: "",
    gallery: [],
  };
}

export async function confirmLocalEmail(token: string): Promise<boolean> {
  assertDatabaseWriteAllowed("prisma");
  const now = new Date();
  const user = await prisma.user.findFirst({
    where: { confirmationToken: token },
    select: { id: true, confirmationExpiresAt: true },
  });
  if (!user || !user.confirmationExpiresAt || user.confirmationExpiresAt.getTime() < now.getTime()) {
    return false;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailConfirmed: true,
      confirmationToken: null,
      confirmationExpiresAt: null,
    },
  });
  await bumpDataRevision(prisma);
  readCache = null;
  return true;
}

export async function findLocalGoogle(identity: GoogleIdentity): Promise<AuthUser | null> {
  return withDb((db) => {
    const profile = db.profiles.find((item) => item.googleSub === identity.sub || item.email === identity.email);
    if (profile) return mapUser(db, profile);
    const driver = db.drivers.find((item) => item.googleSub === identity.sub || item.email === identity.email);
    return driver ? mapDriver(db, driver) : null;
  }, false);
}

export async function registerLocalGoogleCustomer(identity: GoogleIdentity): Promise<AuthUser> {
  return withDb((db) => {
    const existing = db.profiles.find((item) => item.email === identity.email || item.googleSub === identity.sub);
    if (existing) return mapUser(db, existing);
    const profile: Profile = {
      id: randomUUID(),
      email: identity.email,
      passwordHash: hashPassword(randomBytes(24).toString("hex")),
      fullName: identity.name.slice(0, 80),
      phone: null,
      role: "customer",
      googleSub: identity.sub,
      emailConfirmed: true,
      confirmationToken: null,
      confirmationExpiresAt: null,
      avatarDataUrl: null,
      isActive: true,
    };
    db.profiles.push(profile);
    return mapUser(db, profile);
  }, true);
}

function assertIdentityFree(db: Database, email: string, phone: string) {
  if (email && (db.profiles.some((item) => item.email === email) || db.drivers.some((item) => item.email === email))) {
    throw new StoreError("That email is already registered.", 409);
  }
  if (db.profiles.some((item) => item.phone === phone) || db.drivers.some((item) => item.phone === phone)) {
    throw new StoreError("That phone is already registered.", 409);
  }
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export const localRepository = {
  async listTodayMeals(): Promise<MealListResponse> {
    const serviceDate = todayInCasablanca();
    const historyStart = addCasablancaDays(serviceDate, 1 - MEAL_HISTORY_DAYS);
    const rows = await prisma.meal.findMany({
      where: {
        isPublished: true,
        isDeleted: false,
        isActive: true,
        serviceDate: {
          gte: new Date(`${historyStart}T00:00:00.000Z`),
          lte: new Date(`${serviceDate}T00:00:00.000Z`),
        },
      },
      orderBy: [{ remainingQuantity: "desc" }, { createdAt: "desc" }],
    });
    if (rows.length === 0) return { serviceDate, meals: [] };
    const chefIds = [...new Set(rows.map((row) => row.chefId))];
    const chefs = await prisma.chefProfile.findMany({
      where: { id: { in: chefIds }, isActive: true },
      select: {
        id: true,
        kitchenName: true,
        city: true,
        user: { select: { approvalStatus: true, isDeleted: true } },
      },
    });
    const chefById = new Map(chefs.map((chef) => [chef.id, chef]));
    const meals: PublicMeal[] = rows.flatMap((row) => {
      const chef = chefById.get(row.chefId);
      if (!chef || chef.user.isDeleted || chef.user.approvalStatus !== "APPROVED") return [];
      const paths =
        row.images?.length > 0 ? row.images : row.imageUrl ? [row.imageUrl] : [];
      return [
        {
          id: row.id,
          chefId: row.chefId,
          title: row.title,
          description: row.description,
          priceMad: row.price,
          maxQuantity: row.quantity,
          remainingQuantity: row.remainingQuantity,
          serviceDate: row.serviceDate.toISOString().slice(0, 10),
          kitchenName: chef.kitchenName || "Kitchen",
          city: chef.city ?? "",
          photoUrl: paths.length > 0 ? `/api/meals/${row.id}/photo?i=0` : null,
          photoUrls: paths.map((_, index) => `/api/meals/${row.id}/photo?i=${index}`),
        },
      ];
    });
    return { serviceDate, meals };
  },

  async placeOrder(input: PlaceOrderInput): Promise<OrderReceipt> {
    return withAdvisoryLock("place_order", () =>
      locked(async () => {
        const loaded = await readDb(true);
        const db = loaded.db;
        const today = todayInCasablanca();
        const meal = db.meals.find((item) => item.id === input.mealId);
        const chef = meal ? chefFor(db, meal.chefId) : undefined;
        if (!meal || !chef || !meal.isPublished || !mealIsVisible(meal) || meal.serviceDate !== today) {
          throw new StoreError("This meal is not on today's board.", 404);
        }
        if (meal.remainingQuantity < input.quantity) {
          throw new StoreError("Not enough portions left.", 409);
        }
        // COD: customer pays meal cash only. Delivery fee + wallet commissions are frozen.
        const totalMad = cashMealTotalMad(meal.priceMad, input.quantity);
        const code = newDeliveryCode();
        const createdAt = new Date().toISOString();
        const orderId = randomUUID();
        const otpHash = hashPassword(code);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        const trackToken = newTrackToken();

        await atomicPlaceOrder({
          id: orderId,
          mealId: meal.id,
          chefId: meal.chefId,
          quantity: input.quantity,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat ?? null,
          deliveryLng: input.deliveryLng ?? null,
          customerNotes: input.customerNotes,
          unitPriceMad: meal.priceMad,
          totalMad,
          otpHash,
          otpExpiry,
          deliveryCode: code,
          trackToken,
          createdAt: new Date(createdAt),
        });

        meal.remainingQuantity -= input.quantity;
        const order: Order = {
          id: orderId,
          mealId: meal.id,
          chefId: meal.chefId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat ?? null,
          deliveryLng: input.deliveryLng ?? null,
          quantity: input.quantity,
          unitPriceMad: meal.priceMad,
          commissionPerMealMad: 0,
          totalMad,
          commissionMad: 0,
          deliveryFeeMad: 0,
          driverCommissionMad: 0,
          chefServiceFee: 0,
          driverCommission: 0,
          otpHash,
          otpExpiry: otpExpiry.toISOString(),
          otpAttempts: 0,
          refuseReason: null,
          driverId: null,
          customerNotes: input.customerNotes,
          customerEmail: null,
          paymentMethod: "cash",
          paymentStatus: "due_on_delivery",
          deliveryCode: "",
          trackToken,
          status: "pending",
          rating: null,
          review: null,
          createdAt,
        };
        db.orders.push(order);
        rememberDb(db);
        await safeStatusEvent({
          orderId,
          fromStatus: "none",
          toStatus: "pending",
          actorRole: "customer",
          actorId: null,
          reason: null,
        });
        return {
          id: order.id,
          mealTitle: meal.title,
          kitchenName: chef.kitchenName,
          customerName: order.customerName,
          deliveryAddress: order.deliveryAddress,
          quantity: order.quantity,
          unitPriceMad: order.unitPriceMad,
          totalMad: order.totalMad,
          deliveryFeeMad: order.deliveryFeeMad,
          customerNotes: order.customerNotes,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          deliveryCode: code,
          trackToken: order.trackToken,
          createdAt,
        };
      }),
    );
  },

  async chefBoard(chefId: string): Promise<ChefBoard> {
    return withDb((db) => {
      const today = todayInCasablanca();
      const meals = db.meals
        .filter((meal) => meal.chefId === chefId && mealIsVisible(meal))
        .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || b.createdAt.localeCompare(a.createdAt))
        .map((meal) => toChefMeal(db, meal));
      const orders = db.orders
        .filter(
          (order) =>
            order.chefId === chefId &&
            order.isDeleted !== true &&
            (order.status === "pending" ||
              order.status === "confirmed" ||
              order.status === "assigned" ||
              order.status === "picked_up" ||
              todayInCasablanca(new Date(order.createdAt)) === today),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((order) => toChefOrder(db, order));
      const chef = db.chefs.find((item) => item.id === chefId);
      return { serviceDate: today, meals, orders, approvalStatus: chef?.approvalStatus ?? "pending" };
    }, false);
  },

  async createMeal(chefId: string, input: CreateMealInput): Promise<ChefMeal> {
    assertDatabaseWriteAllowed("prisma");
    const chef = await prisma.chefProfile.findFirst({
      where: { id: chefId, isActive: true },
      select: {
        id: true,
        userId: true,
        kitchenName: true,
        city: true,
        user: { select: { approvalStatus: true, isDeleted: true } },
      },
    });
    if (!chef || chef.user.isDeleted) throw new StoreError("This kitchen is not active.", 403);
    if (chef.user.approvalStatus !== "APPROVED") {
      throw new StoreError("Your account is under review. You cannot publish meals until approved.", 403);
    }
    await assertPrismaWalletOpen(chef.userId);
    const serviceDate = todayInCasablanca();
    const created = await prisma.meal.create({
      data: {
        id: randomUUID(),
        chefId,
        title: input.title,
        description: input.description,
        price: input.priceMad,
        quantity: input.maxQuantity,
        remainingQuantity: input.maxQuantity,
        serviceDate: new Date(`${serviceDate}T00:00:00.000Z`),
        isPublished: true,
        imageUrl: null,
        images: [],
        isDeleted: false,
        isActive: true,
      },
    });
    await bumpDataRevision(prisma);
    readCache = null;
    return chefMealFromRow(created, chef.kitchenName, chef.city ?? "");
  },

  async updateMeal(chefId: string, mealId: string, input: CreateMealInput): Promise<ChefMeal> {
    assertDatabaseWriteAllowed("prisma");
    const meal = await prisma.meal.findFirst({
      where: { id: mealId, chefId, isDeleted: false },
    });
    if (!meal) throw new StoreError("That meal could not be found.", 404);
    const chef = await prisma.chefProfile.findFirst({
      where: { id: chefId },
      select: { kitchenName: true, city: true },
    });
    const delta = input.maxQuantity - meal.quantity;
    const remainingQuantity = Math.max(0, Math.min(input.maxQuantity, meal.remainingQuantity + delta));
    const updated = await prisma.meal.update({
      where: { id: mealId },
      data: {
        title: input.title,
        description: input.description,
        price: input.priceMad,
        quantity: input.maxQuantity,
        remainingQuantity,
      },
    });
    await bumpDataRevision(prisma);
    readCache = null;
    return chefMealFromRow(updated, chef?.kitchenName ?? "Kitchen", chef?.city ?? "");
  },

  async deleteMeal(chefId: string, mealId: string): Promise<void> {
    assertDatabaseWriteAllowed("prisma");
    const meal = await prisma.meal.findFirst({
      where: { id: mealId, chefId },
      select: { id: true },
    });
    if (!meal) throw new StoreError("That meal could not be found.", 404);
    const orderCount = await prisma.order.count({ where: { mealId } });
    await prisma.meal.update({
      where: { id: mealId },
      data: {
        isDeleted: true,
        isActive: false,
        ...(orderCount > 0 ? { isPublished: false } : {}),
      },
    });
    await bumpDataRevision(prisma);
    readCache = null;
  },

  async withdrawChef(profileId: string): Promise<void> {
    return withDb((db) => {
      const profile = db.profiles.find((item) => item.id === profileId && item.role === "chef");
      const chef = db.chefs.find((item) => item.profileId === profileId);
      if (!profile || !chef) throw new StoreError("That kitchen could not be found.", 404);
      if (chef.approvalStatus === "approved") throw new StoreError("This kitchen is already approved.", 400);
      chef.isActive = false;
      profile.isActive = false;
      profile.isDeleted = true;
      profile.email = `withdrawn+${profile.id}@withdrawn.wajbati.local`;
      profile.phone = `w${profile.id.replaceAll("-", "").slice(0, 12)}`;
    }, true);
  },

  async listStaff(): Promise<StaffAccount[]> {
    return withDb((db) => {
      const chefs = db.chefs.filter((chef) => db.profiles.find((item) => item.id === chef.profileId)?.isDeleted !== true).map((chef) => {
        const profile = db.profiles.find((item) => item.id === chef.profileId);
        return {
          id: chef.id,
          name: profile?.fullName ?? chef.kitchenName,
          role: "chef" as const,
          status: chef.approvalStatus,
          city: chef.city,
          email: profile?.email ?? "",
        };
      });
      const drivers = db.drivers.filter((driver) => driver.isDeleted !== true).map((driver) => ({
        id: driver.id,
        name: driver.fullName,
        role: "driver" as const,
        status: driver.status,
        city: driver.city,
        email: driver.email,
      }));
      return [...chefs, ...drivers];
    }, false);
  },

  async setMealPublished(chefId: string, mealId: string, isPublished: boolean): Promise<ChefMeal> {
    assertDatabaseWriteAllowed("prisma");
    const meal = await prisma.meal.findFirst({
      where: { id: mealId, chefId, isDeleted: false },
    });
    if (!meal) throw new StoreError("That meal could not be found.", 404);
    const chef = await prisma.chefProfile.findFirst({
      where: { id: chefId, isActive: true },
      select: { userId: true, kitchenName: true, city: true },
    });
    if (isPublished) {
      if (!chef) throw new StoreError("This kitchen is not active.", 403);
      await assertPrismaWalletOpen(chef.userId);
    }
    const updated = await prisma.meal.update({
      where: { id: mealId },
      data: { isPublished },
    });
    await bumpDataRevision(prisma);
    readCache = null;
    return chefMealFromRow(updated, chef?.kitchenName ?? "Kitchen", chef?.city ?? "");
  },

  async updateOrderStatus(chefId: string, orderId: string, status: OrderStatus): Promise<ChefOrder> {
    return locked(async () => {
      const loaded = await readDb(true);
      const db = loaded.db;
      const order = db.orders.find((item) => item.id === orderId && item.chefId === chefId);
      if (!order) throw new StoreError("That order could not be found.", 404);
      assertTransition(order.status, status);
      const previous = order.status;

      if (status === "cancelled" && previous !== "cancelled") {
        const restored = await atomicCancelOrder({
          orderId,
          chefId,
          fromStatuses: [previous],
          restoreQuantity: previous === "pending" || previous === "confirmed",
        });
        if (!restored) throw new StoreError("That status change is not allowed.", 409);
        order.status = "cancelled";
        order.refuseReason = formatClosureReason(
          "chef",
          previous === "pending" ? "cancelled_before_prep" : "cancelled_after_prep",
        );
        const meal = db.meals.find((item) => item.id === order.mealId);
        if (meal && (previous === "pending" || previous === "confirmed")) {
          meal.remainingQuantity = Math.min(meal.maxQuantity, meal.remainingQuantity + order.quantity);
        }
        logRefusalPenalty(db, order);
        rememberDb(db);
        await safeStatusEvent({
          orderId,
          fromStatus: previous,
          toStatus: "cancelled",
          actorRole: "chef",
          actorId: chefId,
          reason: order.refuseReason,
        });
        return toChefOrder(db, order);
      }

      if (status === "confirmed" && previous === "pending") {
        await atomicConfirmOrder({ orderId, chefId });
        order.status = "confirmed";
        rememberDb(db);
        await safeStatusEvent({
          orderId,
          fromStatus: previous,
          toStatus: "confirmed",
          actorRole: "chef",
          actorId: chefId,
          reason: null,
        });
        return toChefOrder(db, order);
      }

      if (status === "delivered" && previous !== "delivered") {
        throw new StoreError("Drivers confirm delivery with the OTP code.", 409);
      }

      throw new StoreError("That status change is not allowed.", 409);
    });
  },

  async adminOverview(): Promise<AdminOverview> {
    return withDb((db) => {
      const today = todayInCasablanca();
      const active = db.orders.filter((order) => order.status !== "cancelled" && order.isDeleted !== true);
      const todayOrders = active.filter(
        (order) => todayInCasablanca(new Date(order.createdAt)) === today,
      );
      const kitchens: KitchenStat[] = db.chefs
        .filter((chef) => chef.isActive)
        .map((chef) => {
          const rows = todayOrders.filter((order) => order.chefId === chef.id);
          const money = snapshot(rows);
          return {
            chefId: chef.id,
            kitchenName: chef.kitchenName,
            city: chef.city,
            orders: money.orders,
            portions: money.portions,
            revenueMad: money.grossRevenueMad,
            commissionMad: money.commissionMad,
            payoutMad: money.chefPayoutMad,
          };
        });
      const recentOrders = [...db.orders]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12)
        .map((order) => toRecent(db, order));
      return {
        // Legacy fee constants are frozen / not owner-approved — do not surface as live rates.
        commissionPerMealMad: 0,
        deliveryFeeMad: 0,
        driverCommissionPerTripMad: 0,
        chefWalletCommissionMad: settingsOf(db).chefCommissionMad,
        driverWalletCommissionMad: settingsOf(db).driverCommissionMad,
        serviceDate: today,
        today: snapshot(todayOrders),
        allTime: snapshot(active),
        todayBooks: financeOf(rowsOnDate(db.orders, today)),
        weekBooks: financeOf(rowsThisWeek(db.orders)),
        openOrders: db.orders.filter((order) =>
          order.status === "pending" ||
          order.status === "confirmed" ||
          order.status === "assigned" ||
          order.status === "picked_up",
        ).length,
        cancelledOrders: db.orders.filter((order) => order.status === "cancelled").length,
        platformRevenueMad: roundMoney(
          active
            .filter((order) => order.status === "delivered")
            .reduce((sum, order) => sum + order.commissionMad + order.driverCommissionMad, 0),
        ),
        kitchens,
        recentOrders,
        drivers: [...db.drivers]
          .filter((driver) => driver.isDeleted !== true)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((driver) => toDriverRecord(db, driver)),
        activeDeliveries: db.orders
          .filter((order) => order.status === "assigned" || order.status === "picked_up")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((order): ActiveDelivery => ({
            ...toJob(db, order),
            driverName: db.drivers.find((driver) => driver.id === order.driverId)?.fullName ?? "Driver",
          })),
      };
    }, false);
  },

  async driverBoard(driverId: string): Promise<DriverBoard> {
    return withDb((db) => {
      const driver = requireDriver(db, driverId);
      const available =
        driver.status === "approved"
          ? db.orders
              .filter((order) => {
                const chef = db.chefs.find((item) => item.id === order.chefId);
                return order.status === "confirmed" && order.driverId === null && chef?.city === driver.city;
              })
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map((order) => toJob(db, order))
          : [];
      const mine = db.orders.filter((order) => order.driverId === driver.id);
      const completed = mine.filter((order) => order.status === "delivered");
      const fees = completed.reduce((sum, order) => sum + order.deliveryFeeMad, 0);
      const commission = completed.reduce((sum, order) => sum + order.driverCommissionMad, 0);
      return {
        city: driver.city,
        accountStatus: driver.status,
        available,
        active: mine
          .filter((order) => order.status === "assigned" || order.status === "picked_up")
          .map((order) => toJob(db, order)),
        completed: completed.map((order) => toJob(db, order)),
        earnings: {
          trips: completed.length,
          feesMad: roundMoney(fees),
          commissionMad: roundMoney(commission),
          netMad: roundMoney(fees - commission),
        },
      };
    }, false);
  },

  async acceptDelivery(driverId: string, orderId: string): Promise<DeliveryJob> {
    return withAdvisoryLock("accept_delivery", () =>
      locked(async () => {
        const loaded = await readDb(true);
        const db = loaded.db;
        const driver = requireDriver(db, driverId);
        if (driver.status !== "approved") {
          throw new StoreError("Your application is still waiting for approval.", 403);
        }
        assertWalletOpen(db, driver.id);
        const order = db.orders.find((item) => item.id === orderId);
        if (!order) throw new StoreError("That delivery could not be found.", 404);
        const chef = db.chefs.find((item) => item.id === order.chefId);
        if (!chef || chef.city !== driver.city) {
          throw new StoreError("That delivery is outside your zone.", 409);
        }
        if (order.status !== "confirmed" || order.driverId) {
          throw new StoreError("That delivery was just taken.", 409);
        }
        await atomicAcceptDelivery({ orderId, driverId: driver.id });
        order.status = "assigned";
        order.driverId = driver.id;
        rememberDb(db);
        await safeStatusEvent({
          orderId,
          fromStatus: "confirmed",
          toStatus: "assigned",
          actorRole: "driver",
          actorId: driverId,
          reason: null,
        });
        return toJob(db, order);
      }),
    );
  },

  async advanceDelivery(
    driverId: string,
    orderId: string,
    action: "pick_up" | "deliver" | "release" | "refuse" | "not_reachable",
    code?: string,
    reason?: string,
  ): Promise<DeliveryJob> {
    return withAdvisoryLock(`advance:${orderId}`, () =>
      locked(async () => {
        const loaded = await readDb(true);
        const db = loaded.db;
        requireDriver(db, driverId);
        const order = db.orders.find((item) => item.id === orderId && item.driverId === driverId);
        if (!order) throw new StoreError("That delivery is not yours.", 404);
        const previous = order.status;

        if (action === "release") {
          assertTransition(order.status, "confirmed");
          await atomicAdvanceDelivery({
            orderId,
            driverId,
            fromStatuses: ["assigned"],
            toStatus: "confirmed",
            clearDriver: true,
          });
          order.status = "confirmed";
          order.driverId = null;
        } else if (action === "pick_up") {
          assertTransition(order.status, "picked_up");
          await atomicAdvanceDelivery({
            orderId,
            driverId,
            fromStatuses: ["assigned"],
            toStatus: "picked_up",
          });
          order.status = "picked_up";
        } else if (action === "refuse" || action === "not_reachable") {
          const next = action === "refuse" ? "refused" : "not_reachable";
          assertTransition(order.status, next);
          const detail =
            reason?.trim() || (action === "refuse" ? "customer_refused_meal" : "customer_unreachable");
          const closure = formatClosureReason("customer", detail);
          await atomicAdvanceDelivery({
            orderId,
            driverId,
            fromStatuses: [order.status],
            toStatus: next,
            refuseReason: closure,
          });
          order.status = next;
          order.refuseReason = closure;
          logRefusalPenalty(db, order);
        } else {
          assertTransition(order.status, "delivered");
          await atomicDeliverWithOtp({
            orderId,
            driverId,
            code: code ?? "",
            verify: verifyPassword,
          });
          order.status = "delivered";
          order.otpAttempts = (order.otpAttempts ?? 0) + 1;
          // Physical delivery only — settlement stays deferred while financial rules are frozen.
          trySettleDeliveryCommissions(db, order);
        }

        rememberDb(db);
        await safeStatusEvent({
          orderId,
          fromStatus: previous,
          toStatus: order.status,
          actorRole: "driver",
          actorId: driverId,
          reason: order.refuseReason ?? null,
        });
        return toJob(db, order);
      }),
    );
  },

  async adminResolveOrder(
    orderId: string,
    resolution: "cancelled" | "refused" | "not_reachable",
    reason: string,
  ): Promise<{ orderId: string; status: OrderStatus }> {
    return locked(async () => {
      const loaded = await readDb(true);
      const db = loaded.db;
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) throw new StoreError("That order could not be found.", 404);
      if (order.status === "delivered") {
        throw new StoreError("That status change is not allowed.", 409);
      }
      const previous = order.status;
      const closure = formatClosureReason("admin", reason || resolution);
      const restoreQuantity = previous === "pending" || previous === "confirmed";
      const result = await atomicAdminResolveOrder({
        orderId,
        toStatus: resolution,
        reason: closure,
        restoreQuantity,
      });
      if (!result) throw new StoreError("That order could not be found.", 404);
      order.status = resolution;
      order.refuseReason = closure;
      if (restoreQuantity) {
        const meal = db.meals.find((item) => item.id === order.mealId);
        if (meal) {
          meal.remainingQuantity = Math.min(meal.maxQuantity, meal.remainingQuantity + order.quantity);
        }
      }
      rememberDb(db);
      await safeStatusEvent({
        orderId,
        fromStatus: previous,
        toStatus: resolution,
        actorRole: "admin",
        actorId: null,
        reason: closure,
      });
      return { orderId, status: resolution };
    });
  },

  async trackOrder(token: string): Promise<OrderTracking> {
    return withDb((db) => {
      const order = db.orders.find((item) => item.trackToken === token);
      if (!order) throw new StoreError("That order could not be found.", 404);
      const meal = db.meals.find((item) => item.id === order.mealId);
      const chef = db.chefs.find((item) => item.id === order.chefId);
      return {
        orderId: order.id,
        mealTitle: meal?.title ?? "Meal",
        kitchenName: chef?.kitchenName ?? "Kitchen",
        chefId: order.chefId,
        deliveryAddress: order.deliveryAddress,
        quantity: order.quantity,
        totalMad: order.totalMad,
        deliveryFeeMad: order.deliveryFeeMad,
        customerNotes: order.customerNotes,
        status: order.status,
        deliveryCode: order.deliveryCode,
        rating: order.rating ?? null,
        review: order.review ?? null,
        createdAt: order.createdAt,
      };
    }, false);
  },

  async rateOrder(token: string, rating: number, review: string): Promise<OrderTracking> {
    assertDatabaseWriteAllowed("prisma");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new StoreError("That status is not recognized.", 400);
    }
    const order = await prisma.order.findFirst({
      where: { trackToken: token, isDeleted: false },
    });
    if (!order) throw new StoreError("That order could not be found.", 404);
    if (order.flowStatus !== "delivered") throw new StoreError("That status change is not allowed.", 409);
    if (typeof order.rating === "number" && order.rating >= 1) {
      throw new StoreError("That status change is not allowed.", 409);
    }
    const trimmed = review.trim().slice(0, 400) || null;
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { rating, review: trimmed },
    });
    const rated = await prisma.order.findMany({
      where: { chefId: order.chefId, rating: { gte: 1 } },
      select: { rating: true },
    });
    const average =
      rated.length === 0 ? 0 : roundMoney(rated.reduce((sum, row) => sum + (row.rating ?? 0), 0) / rated.length);
    await prisma.chefProfile.updateMany({
      where: { OR: [{ id: order.chefId }, { userId: order.chefId }] },
      data: { averageRating: average },
    });
    await bumpDataRevision(prisma);
    readCache = null;
    const meal = await prisma.meal.findUnique({ where: { id: order.mealId }, select: { title: true } });
    const chef = await prisma.chefProfile.findFirst({
      where: { OR: [{ id: order.chefId }, { userId: order.chefId }] },
      select: { kitchenName: true },
    });
    return {
      orderId: updated.id,
      mealTitle: meal?.title ?? "Meal",
      kitchenName: chef?.kitchenName ?? "Kitchen",
      chefId: updated.chefId,
      deliveryAddress: updated.address,
      quantity: updated.quantity,
      totalMad: updated.totalPrice,
      deliveryFeeMad: updated.deliveryFeeMad,
      customerNotes: updated.notes ?? "",
      status: "delivered",
      deliveryCode: updated.otpCode,
      rating: updated.rating ?? null,
      review: updated.review ?? null,
      createdAt: updated.createdAt.toISOString(),
    };
  },

  async publicChef(chefId: string, viewerId: string | null): Promise<PublicChefProfile> {
    return withDb((db) => {
      const chef = db.chefs.find((item) => item.id === chefId && item.isActive);
      if (!chef || chef.approvalStatus !== "approved") throw new StoreError("That kitchen could not be found.", 404);
      const profile = db.profiles.find((item) => item.id === chef.profileId);
      const meals = db.meals
        .filter((meal) => meal.chefId === chef.id && meal.isPublished && mealIsVisible(meal) && serviceDateInHistory(meal.serviceDate))
        .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))
        .map((meal) => toPublicMeal(db, meal));
      const following = Boolean(
        viewerId && db.follows.some((row) => row.customerId === viewerId && row.chefId === chef.profileId),
      );
      return {
        id: chef.id,
        userId: chef.profileId,
        kitchenName: chef.kitchenName,
        bio: chef.bio,
        city: chef.city,
        avatarUrl: profile?.avatarDataUrl ?? null,
        coverUrl: chef.kitchenPhotoDataUrl ?? chef.gallery?.[0] ?? null,
        gallery: chef.gallery ?? [],
        averageRating: chef.averageRating ?? 0,
        following,
        meals,
      };
    }, false);
  },

  async followChef(customerId: string, chefId: string): Promise<{ following: boolean }> {
    assertDatabaseWriteAllowed("prisma");
    const customer = await prisma.user.findFirst({
      where: { id: customerId, role: "CUSTOMER", isDeleted: false },
      select: { id: true },
    });
    if (!customer) throw new StoreError("Sign in to continue.", 403);
    const chef = await prisma.chefProfile.findFirst({
      where: { id: chefId, isActive: true, user: { approvalStatus: "APPROVED", isDeleted: false } },
      select: { userId: true },
    });
    if (!chef) throw new StoreError("That kitchen could not be found.", 404);
    const existing = await prisma.follow.findFirst({
      where: { customerId, chefId: chef.userId },
    });
    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      await bumpDataRevision(prisma);
      readCache = null;
      return { following: false };
    }
    await prisma.follow.create({
      data: {
        id: randomUUID(),
        customerId,
        chefId: chef.userId,
      },
    });
    await bumpDataRevision(prisma);
    readCache = null;
    return { following: true };
  },

  async listFollowingMeals(customerId: string): Promise<MealListResponse> {
    return withDb((db) => {
      const serviceDate = todayInCasablanca();
      const followedUserIds = new Set(db.follows.filter((row) => row.customerId === customerId).map((row) => row.chefId));
      const chefIds = new Set(db.chefs.filter((chef) => followedUserIds.has(chef.profileId)).map((chef) => chef.id));
      const meals = db.meals
        .filter((meal) => {
          const chef = chefFor(db, meal.chefId);
          return (
            chefIds.has(meal.chefId) &&
            Boolean(chef) &&
            chef?.approvalStatus === "approved" &&
            meal.isPublished === true &&
            mealIsVisible(meal) &&
            serviceDateInHistory(meal.serviceDate)
          );
        })
        .sort((a, b) => Number(b.remainingQuantity > 0) - Number(a.remainingQuantity > 0))
        .map((meal) => toPublicMeal(db, meal));
      return { serviceDate, meals };
    }, false);
  },

  async setDriverStatus(driverId: string, status: "approved" | "rejected" | "postponed"): Promise<DriverRecord> {
    return withDb((db) => {
      const driver = requireDriver(db, driverId);
      if (status === "approved" && driver.email && !documentsAreReady(driver.vehicle, driver.email, documentKinds(db, driver.id))) {
        throw new StoreError("This driver still needs the required documents.", 409);
      }
      if (status === "postponed") {
        driver.postponedAt = new Date().toISOString();
      } else if (status === "rejected") {
        driver.status = "rejected";
        driver.isActive = false;
        driver.postponedAt = null;
      } else {
        driver.status = "approved";
        driver.isActive = true;
        driver.postponedAt = null;
        driver.emailConfirmed = true;
        driver.confirmationToken = null;
        driver.confirmationExpiresAt = null;
      }
      return toDriverRecord(db, driver);
    }, true);
  },

  async listCustomerOrders(phone: string): Promise<CustomerOrder[]> {
    return withDb((db) => ordersForPhone(db, phone), false);
  },

  async saveDriverDocument(
    driverId: string,
    kind: DocumentKind,
    contentType: "image/jpeg" | "image/png" | "image/webp",
    bytes: Buffer,
  ): Promise<void> {
    const relativePath = await withDb(async (db) => {
      const driver = requireDriver(db, driverId);
      if (!requiredDocumentKinds(driver.vehicle).includes(kind)) {
        throw new StoreError("That document is not required for this vehicle.", 400);
      }
      const previous = db.documents.find((item) => item.driverId === driverId && item.kind === kind);
      if (previous) {
        await removePrivateFile(previous.storagePath);
        db.documents = db.documents.filter((item) => item.id !== previous.id);
      }
      const id = randomUUID();
      const storagePath = `${driverId}/${id}.${extensionFor(contentType)}`;
      await writePrivateFile(storagePath, bytes);
      db.documents.push({
        id,
        driverId,
        kind,
        contentType,
        storagePath,
        createdAt: new Date().toISOString(),
      });
      return storagePath;
    }, true);
    void relativePath;
  },

  async readDriverDocument(documentId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const stored = await withDb((db) => db.documents.find((item) => item.id === documentId) ?? null, false);
    if (!stored) throw new StoreError("That document could not be found.", 404);
    const bytes = await readPrivateFile(stored.storagePath);
    return { bytes, contentType: stored.contentType };
  },

  async removeChef(chefId: string): Promise<void> {
    await withDb(async (db) => {
      const chef = db.chefs.find((item) => item.id === chefId);
      if (!chef) throw new StoreError("That kitchen could not be found.", 404);
      const profile = db.profiles.find((item) => item.id === chef.profileId);
      if (profile?.role === "admin") throw new StoreError("That account could not be found.", 404);
      chef.isActive = false;
      if (profile) {
        profile.isActive = false;
        profile.isDeleted = true;
      }
    }, true);
  },

  async removeDriver(driverId: string): Promise<void> {
    await withDb(async (db) => {
      const driver = db.drivers.find((item) => item.id === driverId);
      if (!driver) throw new StoreError("That driver could not be found.", 404);
      driver.isActive = false;
      driver.isDeleted = true;
    }, true);
  },

  async listPendingChefs(): Promise<PublicChef[]> {
    return withDb((db) => {
      return db.chefs
        .filter((chef) => db.profiles.find((item) => item.id === chef.profileId)?.isDeleted !== true)
        .filter((chef) => chef.approvalStatus === "pending" || chef.approvalStatus === "approved" || chef.approvalStatus === "rejected")
        .map((chef) => toPendingChef(db, chef));
    }, false);
  },

  async setChefApproval(chefId: string, status: "approved" | "rejected" | "postponed"): Promise<PublicChef> {
    return withDb((db) => {
      const chef = db.chefs.find((item) => item.id === chefId);
      if (!chef) throw new StoreError("That kitchen could not be found.", 404);
      const profile = db.profiles.find((item) => item.id === chef.profileId);
      if (status === "postponed") {
        chef.postponedAt = new Date().toISOString();
      } else if (status === "rejected") {
        chef.approvalStatus = "rejected";
        chef.isActive = false;
        chef.postponedAt = null;
        if (profile) profile.isActive = false;
      } else {
        chef.approvalStatus = "approved";
        chef.isActive = true;
        chef.postponedAt = null;
        if (profile) {
          profile.isActive = true;
          profile.emailConfirmed = true;
          profile.confirmationToken = null;
          profile.confirmationExpiresAt = null;
        }
        const updatedChefObject = {
          ...chef,
          approvalStatus: "approved" as const,
          emailConfirmed: profile?.emailConfirmed === true,
          isActive: true,
        };
        console.log("UPDATED CHEF:", updatedChefObject);
      }
      return toPendingChef(db, chef);
    }, true);
  },

  async saveChefDocument(
    chefId: string,
    kind: ChefDocumentKind,
    contentType: "image/jpeg" | "image/png" | "image/webp",
    bytes: Buffer,
  ): Promise<void> {
    await withDb(async (db) => {
      const chef = db.chefs.find((item) => item.id === chefId);
      if (!chef) throw new StoreError("That kitchen could not be found.", 404);
      if (!requiredChefDocuments.includes(kind)) {
        throw new StoreError("That document is not required.", 400);
      }
      const previous = db.chefDocuments.find((item) => item.chefId === chefId && item.kind === kind);
      if (previous) {
        await removePrivateFile(previous.storagePath);
        db.chefDocuments = db.chefDocuments.filter((item) => item.id !== previous.id);
      }
      const id = randomUUID();
      const storagePath = `chefs/${chefId}/${id}.${extensionFor(contentType)}`;
      await writePrivateFile(storagePath, bytes);
      db.chefDocuments.push({ id, chefId, kind, contentType, storagePath, createdAt: new Date().toISOString() });
      if (kind === "cin_front") chef.cinStoragePath = storagePath;
    }, true);
  },

  async readChefDocument(documentId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const stored = await withDb((db) => db.chefDocuments.find((item) => item.id === documentId) ?? null, false);
    if (!stored) throw new StoreError("That document could not be found.", 404);
    const bytes = await readPrivateFile(stored.storagePath);
    return { bytes, contentType: stored.contentType };
  },

  async saveMealPhoto(
    mealId: string,
    contentType: "image/jpeg" | "image/png" | "image/webp",
    bytes: Buffer,
  ): Promise<void> {
    await withDb(async (db) => {
      const meal = db.meals.find((item) => item.id === mealId);
      if (!meal) throw new StoreError("That meal could not be found.", 404);
      const paths = mealPaths(meal);
      if (paths.length >= 8) throw new StoreError("Upload a JPG, PNG, or WEBP photo under 4 MB.", 400);
      const storagePath = `meals/${mealId}/${randomUUID()}.${extensionFor(contentType)}`;
      await writePrivateFile(storagePath, bytes);
      meal.photoPaths = [...paths, storagePath];
      meal.photoPath = meal.photoPaths[0] ?? storagePath;
    }, true);
  },

  async readMealPhoto(mealId: string, index = 0): Promise<{ bytes: Buffer; contentType: string }> {
    const stored = await withDb((db) => db.meals.find((item) => item.id === mealId) ?? null, false);
    const paths = stored ? mealPaths(stored) : [];
    const photoPath = paths[index] ?? paths[0];
    if (!photoPath) throw new StoreError("That photo could not be found.", 404);
    const bytes = await readPrivateFile(photoPath);
    const contentType = photoPath.endsWith(".png")
      ? "image/png"
      : photoPath.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return { bytes, contentType };
  },

  async addGalleryPhoto(userId: string, image: string): Promise<string[]> {
    return withDb((db) => {
      const profile = db.profiles.find((item) => item.id === userId);
      const chef = db.chefs.find((item) => item.profileId === userId);
      const driver = db.drivers.find((item) => item.id === userId);
      const current = chef?.gallery ?? driver?.gallery ?? [];
      if (current.length >= 5) throw new StoreError("Upload a photo.", 400);
      const next = [...current, image];
      if (chef) chef.gallery = next;
      if (driver) driver.gallery = next;
      if (!chef && !driver && profile) throw new StoreError("That account could not be found.", 404);
      if (!chef && !driver) throw new StoreError("That account could not be found.", 404);
      return next;
    }, true);
  },

  async addEmailCapture(email: string, source: string): Promise<void> {
    assertDatabaseWriteAllowed("prisma");
    const key = email.toLowerCase();
    const existing = await prisma.emailCapture.findFirst({
      where: { email: { equals: key, mode: "insensitive" }, source },
      select: { id: true },
    });
    if (existing) return;
    await prisma.emailCapture.create({
      data: {
        id: randomUUID(),
        email,
        source,
      },
    });
    await bumpDataRevision(prisma);
    readCache = null;
  },

  async listEmailCaptures(): Promise<EmailCapture[]> {
    return withDb((db) => db.email_captures.slice(), false);
  },

  async saveChefSignature(chefId: string, signature: string): Promise<void> {
    assertDatabaseWriteAllowed("prisma");
    const chef = await prisma.chefProfile.findFirst({
      where: { id: chefId },
      select: { userId: true },
    });
    if (!chef) throw new StoreError("That kitchen could not be found.", 404);
    await prisma.user.update({
      where: { id: chef.userId },
      data: { signatureUrl: signature },
    });
    await bumpDataRevision(prisma);
    readCache = null;
  },

  async saveDriverSignature(driverId: string, signature: string): Promise<void> {
    assertDatabaseWriteAllowed("prisma");
    const driver = await prisma.user.findFirst({
      where: { id: driverId, role: "DRIVER" },
      select: { id: true },
    });
    if (!driver) throw new StoreError("That driver could not be found.", 404);
    await prisma.user.update({
      where: { id: driverId },
      data: { signatureUrl: signature },
    });
    await bumpDataRevision(prisma);
    readCache = null;
  },

  async saveProfileExtras(
    userId: string,
    input: {
      avatarDataUrl?: string | null;
      bio?: string;
      kitchenPhotoDataUrl?: string | null;
      city?: string;
      notes?: string;
      vehiclePhotoDataUrl?: string | null;
      licensePhotoDataUrl?: string | null;
    },
  ): Promise<void> {
    await withDb((db) => {
      const profile = db.profiles.find((item) => item.id === userId);
      const driver = db.drivers.find((item) => item.id === userId);
      if (profile && input.avatarDataUrl !== undefined) profile.avatarDataUrl = input.avatarDataUrl;
      const chef = profile ? db.chefs.find((item) => item.profileId === profile.id) : undefined;
      if (chef) {
        if (input.bio !== undefined) chef.bio = input.bio;
        if (input.city !== undefined) chef.city = input.city;
        if (input.kitchenPhotoDataUrl !== undefined) chef.kitchenPhotoDataUrl = input.kitchenPhotoDataUrl;
      }
      if (driver) {
        if (input.avatarDataUrl !== undefined) driver.avatarDataUrl = input.avatarDataUrl;
        if (input.notes !== undefined) driver.notes = input.notes;
        if (input.vehiclePhotoDataUrl !== undefined) driver.vehiclePhotoDataUrl = input.vehiclePhotoDataUrl;
        if (input.licensePhotoDataUrl !== undefined) driver.licensePhotoDataUrl = input.licensePhotoDataUrl;
      }
      if (!profile && !driver) throw new StoreError("Sign in to continue.", 401);
    }, true);
  },

  async attachOrderEmail(orderId: string, email: string): Promise<void> {
    assertDatabaseWriteAllowed("prisma");
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      select: { id: true, customerEmail: true },
    });
    if (!order) throw new StoreError("That order could not be found.", 404);
    if (order.customerEmail) return;
    await prisma.order.update({
      where: { id: orderId },
      data: { customerEmail: email },
    });
    await bumpDataRevision(prisma);
    readCache = null;
  },

  async walletView(ownerId: string): Promise<WalletView> {
    return withDb((db) => ({
      balanceMad: balanceOf(db, ownerId),
      transactions: db.wallet_transactions
        .filter((item) => item.ownerId === ownerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => ({ id: item.id, amountMad: item.amountMad, note: item.note, createdAt: item.createdAt })),
    }), false);
  },

  async adjustWallet(ownerId: string, amountMad: number): Promise<WalletView> {
    return withDb((db) => {
      const known = db.profiles.some((item) => item.id === ownerId) || db.drivers.some((item) => item.id === ownerId) || db.chefs.some((item) => item.profileId === ownerId);
      if (!known) throw new StoreError("That account could not be found.", 404);
      moveWallet(db, ownerId, amountMad, "adjustment", null);
      return {
        balanceMad: balanceOf(db, ownerId),
        transactions: db.wallet_transactions
          .filter((item) => item.ownerId === ownerId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((item) => ({ id: item.id, amountMad: item.amountMad, note: item.note, createdAt: item.createdAt })),
      };
    }, true);
  },

  async listMessages(threadId: string): Promise<ChatThread | null> {
    return withDb((db) => threadFor(db, threadId), false);
  },

  async listMessageThreads(): Promise<ChatThread[]> {
    return withDb((db) => {
      const ids = [...new Set(db.messages.map((item) => item.threadId))];
      return ids
        .map((id) => threadFor(db, id))
        .filter((item): item is ChatThread => Boolean(item))
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    }, false);
  },

  async sendMessage(input: { threadId: string; participantRole: "chef" | "driver"; participantName: string; sender: "user" | "admin"; body: string }): Promise<ChatThread> {
    return withDb((db) => {
      db.messages.push({
        id: randomUUID(),
        threadId: input.threadId,
        participantRole: input.participantRole,
        participantName: input.participantName,
        sender: input.sender,
        body: input.body,
        createdAt: new Date().toISOString(),
      });
      const thread = threadFor(db, input.threadId);
      if (!thread) throw new StoreError("That conversation could not be found.", 404);
      return thread;
    }, true);
  },

  async openDirectThread(actor: ChatActor, query: DirectThreadQuery): Promise<DirectThread> {
    return withDb((db) => toDirectThread(db, actor, resolveDirectThread(db, actor, query)), false);
  },

  async listDirectThreads(actor: ChatActor): Promise<DirectThread[]> {
    return withDb((db) => {
      const ids = [...new Set(db.direct_messages.map((item) => item.threadId))].filter((threadId) => {
        try {
          assertThreadAccess(db, actor, threadId);
          return true;
        } catch {
          return false;
        }
      });
      return ids
        .map((threadId) => toDirectThread(db, actor, threadId))
        .sort((a, b) => (b.messages.at(-1)?.createdAt ?? "").localeCompare(a.messages.at(-1)?.createdAt ?? ""));
    }, false);
  },

  async sendDirectMessage(actor: ChatActor, input: DirectThreadQuery & { body: string }): Promise<DirectThread> {
    if (messageSharesContact(input.body)) {
      throw new StoreError("Phone numbers, emails, and links are not allowed in chat.", 400);
    }
    // Serialize graph chat writes across instances so a concurrent atomic order
    // bump or sibling message save cannot silently drop this message via 409.
    return withAdvisoryLock("direct-chat", async () =>
      withDb((db) => {
        const threadId = resolveDirectThread(db, actor, input);
        const mealMatch = /^meal:([^:]+):customer:([^:]+)$/.exec(threadId);
        const parsedOrder = parseOrderThreadId(threadId);
        const order = parsedOrder
          ? db.orders.find((item) => item.id === parsedOrder.orderId)
          : undefined;
        const mealId = mealMatch?.[1] ?? order?.mealId ?? input.mealId ?? "";
        db.direct_messages.push({
          id: randomUUID(),
          threadId,
          mealId,
          orderId: order?.id ?? null,
          customerId: mealMatch?.[2] ?? (actor.role === "customer" ? actor.id : null),
          senderRole: actor.role === "chef" || actor.role === "driver" ? actor.role : "customer",
          senderId: actor.id,
          senderName: actor.fullName,
          body: input.body,
          createdAt: new Date().toISOString(),
        });
        return toDirectThread(db, actor, threadId);
      }, true),
    );
  },

  async updateCommissionSettings(input: CommissionSettings): Promise<CommissionSettings> {
    assertDatabaseWriteAllowed("prisma");
    // Financial freeze remains enforced by API/business callers; this only targets the write path.
    const settings = await prisma.platformSetting.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        chefCommissionMad: input.chefCommissionMad,
        driverCommissionMad: input.driverCommissionMad,
      },
      update: {
        chefCommissionMad: input.chefCommissionMad,
        driverCommissionMad: input.driverCommissionMad,
      },
    });
    await bumpDataRevision(prisma);
    readCache = null;
    return {
      chefCommissionMad: settings.chefCommissionMad,
      driverCommissionMad: settings.driverCommissionMad,
    };
  },
};
