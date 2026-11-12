import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { roundMoney } from "@/lib/format";
import type { Database } from "@/lib/db/local-store";
import { prisma } from "@/lib/db/prisma";

type AppOrderStatus = Database["orders"][number]["status"];
type Writer = Prisma.TransactionClient;

const ORDER_STATUS: Record<AppOrderStatus, "PENDING" | "PREPARING" | "READY" | "ACCEPTED" | "DELIVERED" | "CANCELLED"> = {
  pending: "PREPARING",
  confirmed: "READY",
  assigned: "ACCEPTED",
  picked_up: "ACCEPTED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
};

const FLOW_FROM_ENUM: Record<string, AppOrderStatus> = {
  PENDING: "pending",
  PREPARING: "pending",
  READY: "confirmed",
  ACCEPTED: "assigned",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

function missingEmail(id: string) {
  return `missing+${id}@wajbati.local`;
}

function storedEmail(email: string, id: string) {
  const trimmed = email.trim();
  return trimmed || missingEmail(id);
}

function restoredEmail(email: string, id: string) {
  return email === missingEmail(id) ? "" : email;
}

function claim(seen: Set<string>, value: string | null | undefined) {
  if (!value) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  return value;
}

function asTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function dayStamp(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dayText(value: Date) {
  return value.toISOString().slice(0, 10);
}

function approvalOut(status: string): "PENDING" | "APPROVED" | "REJECTED" {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  return "PENDING";
}

function approvalIn(status: string): "pending" | "approved" | "rejected" {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

function profileRole(role: string): "customer" | "chef" | "admin" {
  if (role === "CHEF") return "chef";
  if (role === "ADMIN") return "admin";
  return "customer";
}

function vehicleOf(value: string): Database["drivers"][number]["vehicle"] {
  if (value === "bike" || value === "car" || value === "motorbike") return value;
  return "motorbike";
}

function paymentMethodOf(value: string): Database["orders"][number]["paymentMethod"] {
  return value === "wallet" ? "wallet" : "cash";
}

function paymentStatusOf(value: string): Database["orders"][number]["paymentStatus"] {
  if (value === "unpaid" || value === "pending" || value === "paid" || value === "due_on_delivery") return value;
  return "due_on_delivery";
}

function contentTypeOf(value: string): "image/jpeg" | "image/png" | "image/webp" {
  if (value === "image/png" || value === "image/webp") return value;
  return "image/jpeg";
}

function flowOf(value: string, fallback: string): AppOrderStatus {
  if (value === "pending" || value === "confirmed" || value === "assigned" || value === "picked_up" || value === "delivered" || value === "cancelled") {
    return value;
  }
  return FLOW_FROM_ENUM[fallback] ?? "pending";
}

function poolerTransactionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /transaction|pooler|pgbouncer|prepared statement/i.test(message);
}

async function insertMany<T>(rows: T[], write: (rows: T[]) => Promise<unknown>) {
  if (rows.length === 0) return;
  await write(rows);
}

function receiverFor(row: Database["direct_messages"][number], db: Database, userIds: Set<string>, senderId: string) {
  const mealMatch = /^meal:([^:]+):customer:([^:]+)$/.exec(row.threadId);
  if (mealMatch) {
    const customerId = mealMatch[2];
    const meal = db.meals.find((item) => item.id === mealMatch[1]);
    const chef = meal ? db.chefs.find((item) => item.id === meal.chefId) : undefined;
    const other = senderId === customerId ? chef?.profileId : customerId;
    if (other && userIds.has(other)) return other;
  }
  if (row.threadId.startsWith("order:")) {
    const orderId = row.orderId || row.threadId.slice("order:".length);
    const order = db.orders.find((item) => item.id === orderId);
    if (order?.driverId && senderId !== order.driverId && userIds.has(order.driverId)) return order.driverId;
    const phone = (order?.customerPhone ?? "").replace(/\D/g, "");
    const customer = db.profiles.find((item) => phone.length >= 8 && (item.phone ?? "").replace(/\D/g, "") === phone);
    if (customer && userIds.has(customer.id) && customer.id !== senderId) return customer.id;
  }
  return senderId;
}

async function writeGraph(tx: Writer, db: Database) {
  const phones = new Set<string>();
  const subs = new Set<string>();
  const emails = new Set<string>();
  const userIds = new Set<string>();
  const balances = new Map<string, number>();
  for (const wallet of db.wallets) {
    if (!wallet.profileId || balances.has(wallet.profileId)) continue;
    balances.set(wallet.profileId, wallet.balanceMad);
  }
  const chefByProfile = new Map<string, Database["chefs"][number]>();
  for (const chef of db.chefs) {
    if (!chefByProfile.has(chef.profileId)) chefByProfile.set(chef.profileId, chef);
  }

  const users: Prisma.UserCreateManyInput[] = [];
  for (const profile of db.profiles) {
    const email = storedEmail(profile.email, profile.id);
    if (emails.has(email.toLowerCase())) continue;
    emails.add(email.toLowerCase());
    userIds.add(profile.id);
    const chef = chefByProfile.get(profile.id);
    users.push({
      id: profile.id,
      email,
      phone: claim(phones, profile.phone),
      password: profile.passwordHash || "missing",
      fullName: profile.fullName,
      role: profile.role === "chef" ? "CHEF" : profile.role === "admin" ? "ADMIN" : "CUSTOMER",
      walletBalance: roundMoney(balances.get(profile.id) ?? 0),
      approvalStatus: approvalOut(chef?.approvalStatus ?? "approved"),
      emailConfirmed: profile.emailConfirmed,
      signatureUrl: chef?.signatureDataUrl ?? null,
      googleSub: claim(subs, profile.googleSub),
      confirmationToken: profile.confirmationToken,
      confirmationExpiresAt: asTime(profile.confirmationExpiresAt),
      avatarDataUrl: profile.avatarDataUrl,
      isActive: profile.isActive,
      createdAt: new Date(),
    });
  }
  for (const driver of db.drivers) {
    const email = storedEmail(driver.email, driver.id);
    if (userIds.has(driver.id) || emails.has(email.toLowerCase())) continue;
    emails.add(email.toLowerCase());
    userIds.add(driver.id);
    users.push({
      id: driver.id,
      email,
      phone: claim(phones, driver.phone),
      password: driver.passwordHash || "missing",
      fullName: driver.fullName,
      role: "DRIVER",
      walletBalance: roundMoney(balances.get(driver.id) ?? 0),
      approvalStatus: approvalOut(driver.status),
      emailConfirmed: driver.emailConfirmed,
      signatureUrl: driver.signatureDataUrl,
      googleSub: claim(subs, driver.googleSub),
      confirmationToken: driver.confirmationToken,
      confirmationExpiresAt: asTime(driver.confirmationExpiresAt),
      avatarDataUrl: driver.avatarDataUrl,
      isActive: driver.isActive,
      createdAt: asTime(driver.createdAt) ?? new Date(),
    });
  }

  const chefs: Prisma.ChefProfileCreateManyInput[] = [];
  const seenChefs = new Set<string>();
  for (const chef of db.chefs) {
    if (!userIds.has(chef.profileId) || seenChefs.has(chef.profileId)) continue;
    seenChefs.add(chef.profileId);
    const profile = db.profiles.find((item) => item.id === chef.profileId);
    chefs.push({
      id: chef.id,
      userId: chef.profileId,
      bio: chef.bio,
      city: chef.city,
      avatarUrl: profile?.avatarDataUrl ?? null,
      kitchenName: chef.kitchenName,
      cinStoragePath: chef.cinStoragePath,
      autoEntrepreneurNumber: chef.autoEntrepreneurNumber,
      foodSafetyAcceptedAt: asTime(chef.foodSafetyAcceptedAt),
      kitchenPhotoDataUrl: chef.kitchenPhotoDataUrl,
      postponedAt: asTime(chef.postponedAt),
      isActive: chef.isActive,
      createdAt: asTime(chef.createdAt) ?? new Date(),
    });
  }

  const drivers: Prisma.DriverProfileCreateManyInput[] = db.drivers
    .filter((driver) => userIds.has(driver.id))
    .map((driver) => ({
      id: driver.id,
      userId: driver.id,
      vehicleType: driver.vehicle,
      licenseUrl: driver.licensePhotoDataUrl,
      city: driver.city,
      notes: driver.notes,
      vehiclePhotoDataUrl: driver.vehiclePhotoDataUrl,
      postponedAt: asTime(driver.postponedAt),
      isActive: driver.isActive,
      createdAt: asTime(driver.createdAt) ?? new Date(),
    }));

  const phoneToCustomer = new Map<string, string>();
  for (const profile of db.profiles) {
    const digits = (profile.phone ?? "").replace(/\D/g, "");
    if (digits.length >= 8 && userIds.has(profile.id) && !phoneToCustomer.has(digits)) phoneToCustomer.set(digits, profile.id);
  }

  const meals: Prisma.MealCreateManyInput[] = db.meals.map((meal) => ({
    id: meal.id,
    chefId: meal.chefId,
    title: meal.title,
    description: meal.description,
    price: meal.priceMad,
    quantity: meal.maxQuantity,
    remainingQuantity: meal.remainingQuantity,
    isPublished: meal.isPublished,
    serviceDate: dayStamp(meal.serviceDate),
    imageUrl: meal.photoPath,
    createdAt: asTime(meal.createdAt) ?? new Date(),
  }));
  const mealIds = new Set(meals.map((meal) => meal.id));

  const orders: Prisma.OrderCreateManyInput[] = db.orders
    .filter((order) => mealIds.has(order.mealId))
    .map((order) => ({
      id: order.id,
      customerId: phoneToCustomer.get(order.customerPhone.replace(/\D/g, "")) ?? null,
      driverId: order.driverId,
      mealId: order.mealId,
      chefId: order.chefId,
      quantity: order.quantity,
      status: ORDER_STATUS[order.status] ?? "PREPARING",
      flowStatus: order.status,
      otpCode: order.deliveryCode,
      address: order.deliveryAddress,
      notes: order.customerNotes,
      totalPrice: order.totalMad,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      unitPriceMad: order.unitPriceMad,
      commissionPerMealMad: order.commissionPerMealMad,
      commissionMad: order.commissionMad,
      deliveryFeeMad: order.deliveryFeeMad,
      driverCommissionMad: order.driverCommissionMad,
      customerEmail: order.customerEmail,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      trackToken: order.trackToken,
      createdAt: asTime(order.createdAt) ?? new Date(),
    }));

  const transactions: Prisma.WalletTransactionCreateManyInput[] = db.wallet_transactions
    .filter((item) => userIds.has(item.ownerId))
    .map((item) => ({
      id: item.id,
      userId: item.ownerId,
      amount: item.amountMad,
      type: item.note === "commission" ? "COMMISSION" : "TOPUP",
      note: item.note,
      referenceId: item.orderId,
      createdAt: asTime(item.createdAt) ?? new Date(),
    }));

  const messages: Prisma.MessageCreateManyInput[] = [];
  for (const row of db.direct_messages) {
    if (!userIds.has(row.senderId)) continue;
    messages.push({
      id: row.id,
      senderId: row.senderId,
      receiverId: receiverFor(row, db, userIds, row.senderId),
      content: row.body,
      createdAt: asTime(row.createdAt) ?? new Date(),
      threadId: row.threadId,
      mealId: row.mealId || null,
      orderId: row.orderId,
      customerId: row.customerId,
      senderRole: row.senderRole,
      senderName: row.senderName,
    });
  }

  const support: Prisma.SupportMessageCreateManyInput[] = db.messages.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    participantRole: row.participantRole,
    participantName: row.participantName,
    sender: row.sender,
    body: row.body,
    createdAt: asTime(row.createdAt) ?? new Date(),
  }));

  const files: Prisma.StoredFileCreateManyInput[] = [
    ...db.chefDocuments.map((row) => ({
      id: row.id,
      ownerId: row.chefId,
      ownerKind: "chef",
      kind: row.kind,
      contentType: row.contentType,
      storagePath: row.storagePath,
      createdAt: asTime(row.createdAt) ?? new Date(),
    })),
    ...db.documents.map((row) => ({
      id: row.id,
      ownerId: row.driverId,
      ownerKind: "driver",
      kind: row.kind,
      contentType: row.contentType,
      storagePath: row.storagePath,
      createdAt: asTime(row.createdAt) ?? new Date(),
    })),
  ];

  const captures: Prisma.EmailCaptureCreateManyInput[] = db.email_captures.map((row) => ({
    id: randomUUID(),
    email: row.email,
    source: row.source,
    createdAt: asTime(row.created_at) ?? new Date(),
  }));

  await tx.message.deleteMany();
  await tx.walletTransaction.deleteMany();
  await tx.order.deleteMany();
  await tx.meal.deleteMany();
  await tx.supportMessage.deleteMany();
  await tx.storedFile.deleteMany();
  await tx.emailCapture.deleteMany();
  await tx.chefProfile.deleteMany();
  await tx.driverProfile.deleteMany();
  await tx.user.deleteMany();
  await tx.platformSetting.deleteMany();

  await tx.platformSetting.create({
    data: {
      id: "default",
      chefCommissionMad: db.settings?.chefCommissionMad ?? 1,
      driverCommissionMad: db.settings?.driverCommissionMad ?? 1,
    },
  });
  await insertMany(users, (rows) => tx.user.createMany({ data: rows }));
  await insertMany(chefs, (rows) => tx.chefProfile.createMany({ data: rows }));
  await insertMany(drivers, (rows) => tx.driverProfile.createMany({ data: rows }));
  await insertMany(meals, (rows) => tx.meal.createMany({ data: rows }));
  await insertMany(orders, (rows) => tx.order.createMany({ data: rows }));
  await insertMany(transactions, (rows) => tx.walletTransaction.createMany({ data: rows }));
  await insertMany(messages, (rows) => tx.message.createMany({ data: rows }));
  await insertMany(support, (rows) => tx.supportMessage.createMany({ data: rows }));
  await insertMany(files, (rows) => tx.storedFile.createMany({ data: rows }));
  await insertMany(captures, (rows) => tx.emailCapture.createMany({ data: rows }));
}

export async function loadGraph(): Promise<Database | null> {
  const count = await prisma.user.count();
  if (count === 0) return null;
  const [users, chefs, drivers, meals, orders, transactions, messages, support, files, captures, settings] = await Promise.all([
    prisma.user.findMany(),
    prisma.chefProfile.findMany(),
    prisma.driverProfile.findMany(),
    prisma.meal.findMany(),
    prisma.order.findMany(),
    prisma.walletTransaction.findMany(),
    prisma.message.findMany(),
    prisma.supportMessage.findMany(),
    prisma.storedFile.findMany(),
    prisma.emailCapture.findMany(),
    prisma.platformSetting.findUnique({ where: { id: "default" } }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const profiles: Database["profiles"] = users
    .filter((user) => user.role !== "DRIVER")
    .map((user) => ({
      id: user.id,
      email: restoredEmail(user.email, user.id),
      passwordHash: user.password,
      fullName: user.fullName,
      phone: user.phone,
      role: profileRole(user.role),
      googleSub: user.googleSub,
      emailConfirmed: user.emailConfirmed,
      confirmationToken: user.confirmationToken,
      confirmationExpiresAt: iso(user.confirmationExpiresAt),
      avatarDataUrl: user.avatarDataUrl,
      isActive: user.isActive,
    }));
  const chefRows: Database["chefs"] = chefs.flatMap((chef) => {
    const user = usersById.get(chef.userId);
    if (!user) return [];
    return [
      {
        id: chef.id,
        profileId: chef.userId,
        kitchenName: chef.kitchenName,
        bio: chef.bio ?? "",
        city: chef.city ?? "",
        isActive: chef.isActive,
        approvalStatus: approvalIn(user.approvalStatus),
        cinStoragePath: chef.cinStoragePath,
        autoEntrepreneurNumber: chef.autoEntrepreneurNumber,
        foodSafetyAcceptedAt: iso(chef.foodSafetyAcceptedAt),
        signatureDataUrl: user.signatureUrl,
        kitchenPhotoDataUrl: chef.kitchenPhotoDataUrl,
        postponedAt: iso(chef.postponedAt),
        createdAt: (iso(chef.createdAt) ?? new Date(0).toISOString()),
      },
    ];
  });
  const driverProfiles = new Map(drivers.map((driver) => [driver.userId, driver]));
  const driverRows: Database["drivers"] = users
    .filter((user) => user.role === "DRIVER")
    .map((user) => {
      const driver = driverProfiles.get(user.id);
      return {
        id: user.id,
        fullName: user.fullName,
        email: restoredEmail(user.email, user.id),
        phone: user.phone ?? "",
        passwordHash: user.password,
        city: driver?.city ?? "",
        vehicle: vehicleOf(driver?.vehicleType ?? "motorbike"),
        status: approvalIn(user.approvalStatus),
        googleSub: user.googleSub,
        createdAt: iso(driver?.createdAt ?? user.createdAt) ?? new Date().toISOString(),
        emailConfirmed: user.emailConfirmed,
        confirmationToken: user.confirmationToken,
        confirmationExpiresAt: iso(user.confirmationExpiresAt),
        signatureDataUrl: user.signatureUrl,
        notes: driver?.notes ?? "",
        avatarDataUrl: user.avatarDataUrl,
        vehiclePhotoDataUrl: driver?.vehiclePhotoDataUrl ?? null,
        licensePhotoDataUrl: driver?.licenseUrl ?? null,
        isActive: driver?.isActive ?? user.isActive,
        postponedAt: iso(driver?.postponedAt ?? null),
      };
    });
  const wallets: Database["wallets"] = users
    .filter((user) => user.walletBalance !== 0)
    .map((user) => ({
      id: `wallet-${user.id}`,
      profileId: user.id,
      phone: null,
      balanceMad: roundMoney(user.walletBalance),
      currency: "MAD",
      createdAt: user.createdAt.toISOString(),
    }));
  return {
    profiles,
    chefs: chefRows,
    meals: meals.map((meal) => ({
      id: meal.id,
      chefId: meal.chefId,
      title: meal.title,
      description: meal.description,
      priceMad: meal.price,
      maxQuantity: meal.quantity,
      remainingQuantity: meal.remainingQuantity,
      serviceDate: dayText(meal.serviceDate),
      isPublished: meal.isPublished,
      createdAt: meal.createdAt.toISOString(),
      photoPath: meal.imageUrl,
    })),
    orders: orders.map((order) => ({
      id: order.id,
      mealId: order.mealId,
      chefId: order.chefId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.address,
      quantity: order.quantity,
      unitPriceMad: order.unitPriceMad,
      commissionPerMealMad: order.commissionPerMealMad,
      totalMad: order.totalPrice,
      commissionMad: order.commissionMad,
      deliveryFeeMad: order.deliveryFeeMad,
      driverCommissionMad: order.driverCommissionMad,
      driverId: order.driverId,
      customerNotes: order.notes ?? "",
      customerEmail: order.customerEmail,
      paymentMethod: paymentMethodOf(order.paymentMethod),
      paymentStatus: paymentStatusOf(order.paymentStatus),
      deliveryCode: order.otpCode,
      trackToken: order.trackToken,
      status: flowOf(order.flowStatus, order.status),
      createdAt: order.createdAt.toISOString(),
    })),
    drivers: driverRows,
    documents: files.flatMap((file) => {
      if (file.ownerKind !== "driver") return [];
      if (file.kind !== "cin_front" && file.kind !== "cin_back" && file.kind !== "license" && file.kind !== "vehicle_papers") return [];
      return [
        {
          id: file.id,
          driverId: file.ownerId,
          kind: file.kind,
          contentType: contentTypeOf(file.contentType),
          storagePath: file.storagePath,
          createdAt: file.createdAt.toISOString(),
        },
      ];
    }),
    chefDocuments: files.flatMap((file) => {
      if (file.ownerKind !== "chef") return [];
      if (file.kind !== "cin_front" && file.kind !== "cin_back" && file.kind !== "auto_entrepreneur") return [];
      return [
        {
          id: file.id,
          chefId: file.ownerId,
          kind: file.kind,
          contentType: contentTypeOf(file.contentType),
          storagePath: file.storagePath,
          createdAt: file.createdAt.toISOString(),
        },
      ];
    }),
    wallets,
    email_captures: captures.map((row) => ({
      email: row.email,
      created_at: row.createdAt.toISOString(),
      source: row.source,
    })),
    messages: support.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      participantRole: row.participantRole === "driver" ? "driver" : "chef",
      participantName: row.participantName,
      sender: row.sender === "admin" ? "admin" : "user",
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    })),
    direct_messages: messages.flatMap((row) => {
      const senderRole = row.senderRole === "chef" || row.senderRole === "driver" ? row.senderRole : "customer";
      return [
        {
          id: row.id,
          threadId: row.threadId,
          mealId: row.mealId ?? "",
          orderId: row.orderId,
          customerId: row.customerId,
          senderRole,
          senderId: row.senderId,
          senderName: row.senderName,
          body: row.content,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    }),
    settings: {
      chefCommissionMad: settings?.chefCommissionMad ?? 1,
      driverCommissionMad: settings?.driverCommissionMad ?? 1,
    },
    wallet_transactions: transactions.map((row) => ({
      id: row.id,
      ownerId: row.userId,
      amountMad: row.amount,
      note: row.note === "commission" ? "commission" : "adjustment",
      orderId: row.referenceId,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function saveGraph(db: Database) {
  try {
    await prisma.$transaction((tx) => writeGraph(tx, db), { timeout: 120_000, maxWait: 20_000 });
  } catch (error) {
    if (!poolerTransactionError(error)) throw error;
    await writeGraph(prisma as unknown as Writer, db);
  }
}
