import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { codesMatch, newDeliveryCode, newTrackToken } from "@/lib/delivery-code";
import { financeOf, rowsOnDate, rowsThisWeek } from "@/lib/finance";
import { DELIVERY_FEE_MAD, DRIVER_COMMISSION_MAD, PLATFORM_COMMISSION_MAD } from "@/lib/constants";
import { documentsAreReady, extensionFor, requiredChefDocuments, requiredDocumentKinds } from "@/lib/documents";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { DRIVER_DEMOS } from "@/lib/driver-demos";
import { StoreError } from "@/lib/errors";
import { removePrivateFile, writePrivateFile, readPrivateFile } from "@/lib/private-files";
import { roundMoney, todayInCasablanca } from "@/lib/format";
import { assertTransition } from "@/lib/orders";
import type {
  ActiveDelivery,
  AdminOverview,
  AuthUser,
  ChatThread,
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
};

type Order = {
  id: string;
  mealId: string;
  chefId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  quantity: number;
  unitPriceMad: number;
  commissionPerMealMad: number;
  totalMad: number;
  commissionMad: number;
  deliveryFeeMad: number;
  driverCommissionMad: number;
  driverId: string | null;
  customerNotes: string;
  customerEmail: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryCode: string;
  trackToken: string;
  status: OrderStatus;
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
  isActive: boolean;
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

type WalletTxn = {
  id: string;
  ownerId: string;
  amountMad: number;
  note: "commission" | "adjustment";
  orderId: string | null;
  createdAt: string;
};

type Database = {
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
  wallet_transactions: WalletTxn[];
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
let volatile: Database | null = null;

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
    wallet_transactions: [],
  };
}

function normalize(db: Database): boolean {
  let changed = false;
  if (!Array.isArray(db.drivers)) {
    db.drivers = seedDrivers();
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
  if (!Array.isArray(db.wallet_transactions)) {
    db.wallet_transactions = [];
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
      if (!verifyPassword(master.password, profile.passwordHash)) {
        profile.passwordHash = hashPassword(master.password);
        changed = true;
      }
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
      order.deliveryFeeMad = DELIVERY_FEE_MAD;
      changed = true;
    }
    if (order.driverCommissionMad === undefined) {
      order.driverCommissionMad = DRIVER_COMMISSION_MAD;
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

async function readDb(): Promise<{ db: Database; created: boolean; migrated: boolean }> {
  if (volatile) return { db: volatile, created: false, migrated: false };
  try {
    const raw = await readFile(filePath, "utf8");
    const db = JSON.parse(raw) as Database;
    return { db, created: false, migrated: normalize(db) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { db: seed(), created: true, migrated: false };
    }
    throw new StoreError("The local order book could not be read.", 500);
  }
}

function diskRejected(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EROFS" || code === "EPERM" || code === "EACCES" || code === "ENOTSUP";
}

async function writeDb(db: Database) {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await rm(filePath, { force: true });
    await rename(tmp, filePath);
    volatile = null;
  } catch (error) {
    if (!diskRejected(error)) throw error;
    volatile = db;
  }
}

async function withDb<T>(fn: (db: Database) => T | Promise<T>, persist: boolean): Promise<T> {
  return locked(async () => {
    const loaded = await readDb();
    if (loaded.created || loaded.migrated) await writeDb(loaded.db);
    const result = await fn(loaded.db);
    if (persist) await writeDb(loaded.db);
    return result;
  });
}

function chefFor(db: Database, chefId: string) {
  return db.chefs.find((chef) => chef.id === chefId && chef.isActive);
}

function toPublicMeal(db: Database, meal: Meal): PublicMeal {
  const chef = db.chefs.find((item) => item.id === meal.chefId);
  return {
    id: meal.id,
    title: meal.title,
    description: meal.description,
    priceMad: meal.priceMad,
    maxQuantity: meal.maxQuantity,
    remainingQuantity: meal.remainingQuantity,
    serviceDate: meal.serviceDate,
    kitchenName: chef?.kitchenName ?? "Kitchen",
    city: chef?.city ?? "",
    photoUrl: meal.photoPath ? `/api/meals/${meal.id}/photo` : null,
  };
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
  };
}

function balanceOf(db: Database, ownerId: string): number {
  return db.wallets.find((item) => item.profileId === ownerId)?.balanceMad ?? 0;
}

function chargeDriverCommission(db: Database, order: Order) {
  if (!order.driverId || order.status !== "delivered") return;
  const already = db.wallet_transactions.some((item) => item.orderId === order.id && item.note === "commission");
  if (already) return;
  moveWallet(db, order.driverId, -DRIVER_COMMISSION_MAD, "commission", order.id);
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

export async function authenticateLocal(email: string, password: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const profile = db.profiles.find((item) => item.email === email);
    const ok = verifyPassword(password, profile?.passwordHash ?? DUMMY_HASH);
    if (!profile || !ok) return null;
    if (profile.emailConfirmed === false && profile.role !== "chef") {
      throw new StoreError("Please confirm your email first.", 403);
    }
    return mapUser(db, profile);
  }, false);
}

export async function findLocalUser(userId: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const profile = db.profiles.find((item) => item.id === userId);
    if (profile) return mapUser(db, profile);
    const driver = db.drivers.find((item) => item.id === userId);
    return driver ? mapDriver(db, driver) : null;
  }, false);
}

export async function authenticateLocalDriver(identifier: string, password: string): Promise<AuthUser | null> {
  return withDb((db) => {
    const driver = db.drivers.find((item) => item.phone === identifier || item.email === identifier);
    const ok = verifyPassword(password, driver?.passwordHash ?? DUMMY_HASH);
    if (!driver || !ok) return null;
    if (driver.emailConfirmed === false) {
      throw new StoreError("Please confirm your email first.", 403);
    }
    return mapDriver(db, driver);
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
  return withDb((db) => {
    const profile = db.profiles.find((item) => item.id === userId && item.role === "customer");
    if (!profile) throw new StoreError("Sign in to continue.", 401);
    if (db.profiles.some((item) => item.id !== userId && item.phone === input.phone)) {
      throw new StoreError("That phone is already registered.", 409);
    }
    if (db.drivers.some((item) => item.phone === input.phone)) {
      throw new StoreError("That phone is already registered.", 409);
    }
    profile.fullName = input.fullName;
    profile.phone = input.phone;
    return mapUser(db, profile);
  }, true);
}

export async function confirmLocalEmail(token: string): Promise<boolean> {
  return withDb((db) => {
    const now = Date.now();
    const profile = db.profiles.find((item) => item.confirmationToken === token);
    if (profile) {
      if (!profile.confirmationExpiresAt || Date.parse(profile.confirmationExpiresAt) < now) return false;
      profile.emailConfirmed = true;
      profile.confirmationToken = null;
      profile.confirmationExpiresAt = null;
      return true;
    }
    const driver = db.drivers.find((item) => item.confirmationToken === token);
    if (!driver || !driver.confirmationExpiresAt || Date.parse(driver.confirmationExpiresAt) < now) return false;
    driver.emailConfirmed = true;
    driver.confirmationToken = null;
    driver.confirmationExpiresAt = null;
    return true;
  }, true);
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
    return withDb((db) => {
      const serviceDate = todayInCasablanca();
      const meals = db.meals
        .filter((meal) => {
          const chef = chefFor(db, meal.chefId);
          return Boolean(chef) && chef?.approvalStatus === "approved" && meal.isPublished === true && meal.serviceDate === serviceDate;
        })
        .sort((a, b) => Number(b.remainingQuantity > 0) - Number(a.remainingQuantity > 0))
        .map((meal) => toPublicMeal(db, meal));
      return { serviceDate, meals };
    }, false);
  },

  async placeOrder(input: PlaceOrderInput): Promise<OrderReceipt> {
    return withDb((db) => {
      const today = todayInCasablanca();
      const meal = db.meals.find((item) => item.id === input.mealId);
      const chef = meal ? chefFor(db, meal.chefId) : undefined;
      if (!meal || !chef || !meal.isPublished || meal.serviceDate !== today) {
        throw new StoreError("This meal is not on today's board.", 404);
      }
      if (meal.remainingQuantity < input.quantity) {
        throw new StoreError("Not enough portions left.", 409);
      }
      meal.remainingQuantity -= input.quantity;
      const createdAt = new Date().toISOString();
      const order: Order = {
        id: randomUUID(),
        mealId: meal.id,
        chefId: meal.chefId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress,
        quantity: input.quantity,
        unitPriceMad: meal.priceMad,
        commissionPerMealMad: PLATFORM_COMMISSION_MAD,
        totalMad: roundMoney(meal.priceMad * input.quantity),
        commissionMad: roundMoney(PLATFORM_COMMISSION_MAD * input.quantity),
        deliveryFeeMad: DELIVERY_FEE_MAD,
        driverCommissionMad: DRIVER_COMMISSION_MAD,
        driverId: null,
        customerNotes: input.customerNotes,
        customerEmail: null,
        paymentMethod: "cash",
        paymentStatus: "due_on_delivery",
        deliveryCode: newDeliveryCode(),
        trackToken: newTrackToken(),
        status: "pending",
        createdAt,
      };
      db.orders.push(order);
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
        deliveryCode: order.deliveryCode,
        trackToken: order.trackToken,
        createdAt,
      };
    }, true);
  },

  async chefBoard(chefId: string): Promise<ChefBoard> {
    return withDb((db) => {
      const today = todayInCasablanca();
      const meals = db.meals
        .filter((meal) => meal.chefId === chefId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((meal) => toChefMeal(db, meal));
      const orders = db.orders
        .filter(
          (order) =>
            order.chefId === chefId &&
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
    return withDb((db) => {
      const chef = chefFor(db, chefId);
      if (!chef) throw new StoreError("This kitchen is not active.", 403);
      if (chef.approvalStatus !== "approved") {
        throw new StoreError("Your account is under review. You cannot publish meals until approved.", 403);
      }
      const meal: Meal = {
        id: randomUUID(),
        chefId,
        title: input.title,
        description: input.description,
        priceMad: input.priceMad,
        maxQuantity: input.maxQuantity,
        remainingQuantity: input.maxQuantity,
        serviceDate: todayInCasablanca(),
        isPublished: true,
        createdAt: new Date().toISOString(),
        photoPath: null,
      };
      db.meals.push(meal);
      return toChefMeal(db, meal);
    }, true);
  },

  async updateMeal(chefId: string, mealId: string, input: CreateMealInput): Promise<ChefMeal> {
    return withDb((db) => {
      const meal = db.meals.find((item) => item.id === mealId && item.chefId === chefId);
      if (!meal) throw new StoreError("That meal could not be found.", 404);
      const delta = input.maxQuantity - meal.maxQuantity;
      meal.title = input.title;
      meal.description = input.description;
      meal.priceMad = input.priceMad;
      meal.maxQuantity = input.maxQuantity;
      meal.remainingQuantity = Math.max(0, Math.min(input.maxQuantity, meal.remainingQuantity + delta));
      return toChefMeal(db, meal);
    }, true);
  },

  async deleteMeal(chefId: string, mealId: string): Promise<void> {
    return withDb((db) => {
      const meal = db.meals.find((item) => item.id === mealId && item.chefId === chefId);
      if (!meal) throw new StoreError("That meal could not be found.", 404);
      if (db.orders.some((order) => order.mealId === mealId)) {
        meal.isPublished = false;
        return;
      }
      db.meals = db.meals.filter((item) => item.id !== mealId);
    }, true);
  },

  async withdrawChef(profileId: string): Promise<void> {
    return withDb((db) => {
      const profile = db.profiles.find((item) => item.id === profileId && item.role === "chef");
      const chef = db.chefs.find((item) => item.profileId === profileId);
      if (!profile || !chef) throw new StoreError("That kitchen could not be found.", 404);
      if (chef.approvalStatus === "approved") throw new StoreError("This kitchen is already approved.", 400);
      const hasOrders = db.orders.some((order) => order.chefId === chef.id);
      if (hasOrders) {
        chef.isActive = false;
        profile.isActive = false;
        profile.email = `withdrawn+${profile.id}@withdrawn.wajbati.local`;
        profile.phone = `w${profile.id.replaceAll("-", "").slice(0, 12)}`;
        return;
      }
      db.chefs = db.chefs.filter((item) => item.id !== chef.id);
      db.profiles = db.profiles.filter((item) => item.id !== profile.id);
      db.chefDocuments = db.chefDocuments.filter((item) => item.chefId !== chef.id);
    }, true);
  },

  async listStaff(): Promise<StaffAccount[]> {
    return withDb((db) => {
      const chefs = db.chefs.map((chef) => {
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
      const drivers = db.drivers.map((driver) => ({
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
    return withDb((db) => {
      const meal = db.meals.find((item) => item.id === mealId && item.chefId === chefId);
      if (!meal) throw new StoreError("That meal could not be found.", 404);
      meal.isPublished = isPublished;
      return toChefMeal(db, meal);
    }, true);
  },

  async updateOrderStatus(chefId: string, orderId: string, status: OrderStatus): Promise<ChefOrder> {
    return withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId && item.chefId === chefId);
      if (!order) throw new StoreError("That order could not be found.", 404);
      assertTransition(order.status, status);
      const previous = order.status;
      order.status = status;
      if (status === "delivered" && previous !== "delivered") chargeDriverCommission(db, order);
      if (status === "cancelled" && previous !== "cancelled") {
        const meal = db.meals.find((item) => item.id === order.mealId);
        if (meal) {
          meal.remainingQuantity = Math.min(meal.maxQuantity, meal.remainingQuantity + order.quantity);
        }
      }
      return toChefOrder(db, order);
    }, true);
  },

  async adminOverview(): Promise<AdminOverview> {
    return withDb((db) => {
      const today = todayInCasablanca();
      const active = db.orders.filter((order) => order.status !== "cancelled");
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
        commissionPerMealMad: PLATFORM_COMMISSION_MAD,
        deliveryFeeMad: DELIVERY_FEE_MAD,
        driverCommissionPerTripMad: DRIVER_COMMISSION_MAD,
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
        kitchens,
        recentOrders,
        drivers: [...db.drivers]
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
    return withDb((db) => {
      const driver = requireDriver(db, driverId);
      if (driver.status !== "approved") {
        throw new StoreError("Your application is still waiting for approval.", 403);
      }
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) throw new StoreError("That delivery could not be found.", 404);
      const chef = db.chefs.find((item) => item.id === order.chefId);
      if (!chef || chef.city !== driver.city) {
        throw new StoreError("That delivery is outside your zone.", 409);
      }
      if (order.status !== "confirmed" || order.driverId) {
        throw new StoreError("That delivery was just taken.", 409);
      }
      order.status = "assigned";
      order.driverId = driver.id;
      return toJob(db, order);
    }, true);
  },

  async advanceDelivery(
    driverId: string,
    orderId: string,
    action: "pick_up" | "deliver" | "release",
    code?: string,
  ): Promise<DeliveryJob> {
    return withDb((db) => {
      requireDriver(db, driverId);
      const order = db.orders.find((item) => item.id === orderId && item.driverId === driverId);
      if (!order) throw new StoreError("That delivery is not yours.", 404);
      if (action === "release") {
        assertTransition(order.status, "confirmed");
        order.status = "confirmed";
        order.driverId = null;
      } else if (action === "pick_up") {
        assertTransition(order.status, "picked_up");
        order.status = "picked_up";
      } else {
        assertTransition(order.status, "delivered");
        if (!codesMatch(order.deliveryCode, code ?? "")) {
          throw new StoreError("That code does not match.", 409);
        }
        order.status = "delivered";
        chargeDriverCommission(db, order);
      }
      return toJob(db, order);
    }, true);
  },

  async trackOrder(token: string): Promise<OrderTracking> {
    return withDb((db) => {
      const order = db.orders.find((item) => item.trackToken === token);
      if (!order) throw new StoreError("That order could not be found.", 404);
      const meal = db.meals.find((item) => item.id === order.mealId);
      const chef = db.chefs.find((item) => item.id === order.chefId);
      return {
        mealTitle: meal?.title ?? "Meal",
        kitchenName: chef?.kitchenName ?? "Kitchen",
        deliveryAddress: order.deliveryAddress,
        quantity: order.quantity,
        totalMad: order.totalMad,
        deliveryFeeMad: order.deliveryFeeMad,
        customerNotes: order.customerNotes,
        status: order.status,
        deliveryCode: order.deliveryCode,
        createdAt: order.createdAt,
      };
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
      for (const document of db.chefDocuments.filter((item) => item.chefId === chef.id)) {
        await removePrivateFile(document.storagePath);
      }
      db.chefDocuments = db.chefDocuments.filter((item) => item.chefId !== chef.id);
      db.chefs = db.chefs.filter((item) => item.id !== chef.id);
      if (profile?.role === "chef") db.profiles = db.profiles.filter((item) => item.id !== profile.id);
      db.wallets = db.wallets.filter((item) => item.profileId !== chef.profileId);
      db.wallet_transactions = db.wallet_transactions.filter((item) => item.ownerId !== chef.profileId);
    }, true);
  },

  async removeDriver(driverId: string): Promise<void> {
    await withDb(async (db) => {
      const driver = db.drivers.find((item) => item.id === driverId);
      if (!driver) throw new StoreError("That driver could not be found.", 404);
      for (const document of db.documents.filter((item) => item.driverId === driver.id)) {
        await removePrivateFile(document.storagePath);
      }
      db.documents = db.documents.filter((item) => item.driverId !== driver.id);
      db.drivers = db.drivers.filter((item) => item.id !== driver.id);
      db.wallets = db.wallets.filter((item) => item.profileId !== driver.id);
      db.wallet_transactions = db.wallet_transactions.filter((item) => item.ownerId !== driver.id);
    }, true);
  },

  async listPendingChefs(): Promise<PublicChef[]> {
    return withDb((db) => {
      return db.chefs
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
      const storagePath = `meals/${mealId}.${extensionFor(contentType)}`;
      await writePrivateFile(storagePath, bytes);
      meal.photoPath = storagePath;
    }, true);
  },

  async readMealPhoto(mealId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const stored = await withDb((db) => db.meals.find((item) => item.id === mealId) ?? null, false);
    if (!stored?.photoPath) throw new StoreError("That photo could not be found.", 404);
    const bytes = await readPrivateFile(stored.photoPath);
    const contentType = stored.photoPath.endsWith(".png")
      ? "image/png"
      : stored.photoPath.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return { bytes, contentType };
  },

  async addEmailCapture(email: string, source: string): Promise<void> {
    await withDb((db) => {
      const key = email.toLowerCase();
      if (db.email_captures.some((item) => item.email.toLowerCase() === key && item.source === source)) return;
      db.email_captures.push({ email, created_at: new Date().toISOString(), source });
    }, true);
  },

  async listEmailCaptures(): Promise<EmailCapture[]> {
    return withDb((db) => db.email_captures.slice(), false);
  },

  async saveChefSignature(chefId: string, signature: string): Promise<void> {
    await withDb((db) => {
      const chef = db.chefs.find((item) => item.id === chefId);
      if (!chef) throw new StoreError("That kitchen could not be found.", 404);
      chef.signatureDataUrl = signature;
    }, true);
  },

  async saveDriverSignature(driverId: string, signature: string): Promise<void> {
    await withDb((db) => {
      const driver = db.drivers.find((item) => item.id === driverId);
      if (!driver) throw new StoreError("That driver could not be found.", 404);
      driver.signatureDataUrl = signature;
    }, true);
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
    return withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) throw new StoreError("That order could not be found.", 404);
      if (!order.customerEmail) order.customerEmail = email;
    }, true);
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
};
