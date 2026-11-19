import { randomUUID } from "crypto";
import { assertDatabaseWriteAllowed } from "@/lib/db-guard";
import { bumpDataRevision } from "@/lib/db/data-revision";
import { prisma } from "@/lib/db/prisma";
import { StoreError } from "@/lib/errors";
import type { OrderStatus } from "@/lib/types";

type PrismaOrderStatus = "PENDING" | "PREPARING" | "READY" | "ACCEPTED" | "DELIVERED" | "CANCELLED" | "REFUSED" | "NOT_REACHABLE";

const ENUM_STATUS: Record<OrderStatus, PrismaOrderStatus> = {
  pending: "PREPARING",
  confirmed: "READY",
  assigned: "ACCEPTED",
  picked_up: "ACCEPTED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  refused: "REFUSED",
  not_reachable: "NOT_REACHABLE",
};

export type PlaceOrderRow = {
  id: string;
  mealId: string;
  chefId: string;
  quantity: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  customerNotes: string;
  unitPriceMad: number;
  totalMad: number;
  otpHash: string;
  otpExpiry: Date;
  deliveryCode: string;
  trackToken: string;
  createdAt: Date;
};

/**
 * Atomically reserve meal portions and insert the order.
 * Conditional UPDATE prevents two customers from overselling the same stock.
 */
export async function atomicPlaceOrder(row: PlaceOrderRow): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$transaction(async (tx) => {
    const reserved = await tx.meal.updateMany({
      where: {
        id: row.mealId,
        isPublished: true,
        remainingQuantity: { gte: row.quantity },
      },
      data: { remainingQuantity: { decrement: row.quantity } },
    });
    if (reserved.count !== 1) {
      throw new StoreError("Not enough portions left.", 409);
    }
    await tx.order.create({
      data: {
        id: row.id,
        mealId: row.mealId,
        chefId: row.chefId,
        quantity: row.quantity,
        status: "PREPARING",
        flowStatus: "pending",
        otpCode: row.deliveryCode,
        otpHash: row.otpHash,
        otpExpiry: row.otpExpiry,
        otpAttempts: 0,
        address: row.deliveryAddress,
        deliveryLat: row.deliveryLat,
        deliveryLng: row.deliveryLng,
        notes: row.customerNotes,
        totalPrice: row.totalMad,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        unitPriceMad: row.unitPriceMad,
        commissionPerMealMad: 0,
        commissionMad: 0,
        deliveryFeeMad: 0,
        driverCommissionMad: 0,
        chefServiceFee: 0,
        driverCommission: 0,
        paymentMethod: "cash",
        paymentStatus: "due_on_delivery",
        trackToken: row.trackToken,
        createdAt: row.createdAt,
      },
    });
    await bumpDataRevision(tx);
  });
}

/** Chef marks a pending order as ready (confirmed). */
export async function atomicConfirmOrder(input: { orderId: string; chefId: string }): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        chefId: input.chefId,
        flowStatus: "pending",
      },
      data: {
        flowStatus: "confirmed",
        status: "READY",
      },
    });
    if (updated.count !== 1) {
      throw new StoreError("That status change is not allowed.", 409);
    }
    await bumpDataRevision(tx);
  });
}

/**
 * Atomically assign a confirmed order to a driver.
 * Only one driver can win when flowStatus=confirmed and driverId is null.
 */
export async function atomicAcceptDelivery(input: {
  orderId: string;
  driverId: string;
}): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        flowStatus: "confirmed",
        driverId: null,
      },
      data: {
        driverId: input.driverId,
        flowStatus: "assigned",
        status: "ACCEPTED",
      },
    });
    if (updated.count !== 1) {
      throw new StoreError("That delivery was just taken.", 409);
    }
    await bumpDataRevision(tx);
  });
}

export async function atomicAdvanceDelivery(input: {
  orderId: string;
  driverId: string;
  fromStatuses: OrderStatus[];
  toStatus: OrderStatus;
  refuseReason?: string | null;
  clearDriver?: boolean;
}): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        driverId: input.driverId,
        flowStatus: { in: input.fromStatuses },
      },
      data: {
        flowStatus: input.toStatus,
        status: ENUM_STATUS[input.toStatus],
        refuseReason: input.refuseReason === undefined ? undefined : input.refuseReason,
        driverId: input.clearDriver ? null : undefined,
      },
    });
    if (updated.count !== 1) {
      throw new StoreError("That status change is not allowed.", 409);
    }
    await bumpDataRevision(tx);
  });
}

/**
 * OTP-confirmed delivery: increments attempts, verifies hash, sets delivered.
 * Does not touch wallets (settlement is separate).
 */
export async function atomicDeliverWithOtp(input: {
  orderId: string;
  driverId: string;
  code: string;
  verify: (given: string, storedHash: string) => boolean;
}): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order || order.driverId !== input.driverId) {
      throw new StoreError("That delivery is not yours.", 404);
    }
    if (order.flowStatus !== "picked_up") {
      throw new StoreError("That status change is not allowed.", 409);
    }
    if (order.otpExpiry && order.otpExpiry.getTime() < Date.now()) {
      throw new StoreError("انتهت صلاحية رمز التسليم.", 409);
    }
    const attempts = (order.otpAttempts ?? 0) + 1;
    if (attempts > 3) {
      throw new StoreError("تم تجاوز عدد محاولات الرمز.", 409);
    }

    const hash = order.otpHash ?? "";
    const matched = hash ? input.verify(input.code, hash) : order.otpCode === input.code;
    if (!matched) {
      await tx.order.update({
        where: { id: input.orderId },
        data: { otpAttempts: attempts },
      });
      throw new StoreError("That code does not match.", 409);
    }

    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        driverId: input.driverId,
        flowStatus: "picked_up",
      },
      data: {
        flowStatus: "delivered",
        status: "DELIVERED",
        otpAttempts: attempts,
      },
    });
    if (updated.count !== 1) {
      throw new StoreError("That status change is not allowed.", 409);
    }
    await bumpDataRevision(tx);
  });
}

/** Release reserved portions when cancelling before/after prep (idempotent on stock). */
export async function atomicCancelOrder(input: {
  orderId: string;
  chefId: string;
  fromStatuses: OrderStatus[];
  restoreQuantity: boolean;
}): Promise<{ quantity: number; mealId: string } | null> {
  assertDatabaseWriteAllowed("prisma");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: input.orderId,
        chefId: input.chefId,
        flowStatus: { in: input.fromStatuses },
      },
    });
    if (!order) return null;

    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        chefId: input.chefId,
        flowStatus: { in: input.fromStatuses },
      },
      data: {
        flowStatus: "cancelled",
        status: "CANCELLED",
      },
    });
    if (updated.count !== 1) return null;

    if (input.restoreQuantity) {
      await tx.meal.update({
        where: { id: order.mealId },
        data: { remainingQuantity: { increment: order.quantity } },
      });
    }
    await bumpDataRevision(tx);
    return { quantity: order.quantity, mealId: order.mealId };
  });
}

export async function atomicAdminResolveOrder(input: {
  orderId: string;
  toStatus: "cancelled" | "refused" | "not_reachable";
  reason: string;
  restoreQuantity: boolean;
}): Promise<{ previousFlow: string; mealId: string; quantity: number } | null> {
  assertDatabaseWriteAllowed("prisma");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) return null;
    const previous = order.flowStatus;
    if (previous === "delivered" || previous === "cancelled" || previous === "refused" || previous === "not_reachable") {
      throw new StoreError("That status change is not allowed.", 409);
    }
    const updated = await tx.order.updateMany({
      where: {
        id: input.orderId,
        flowStatus: previous,
      },
      data: {
        flowStatus: input.toStatus,
        status: ENUM_STATUS[input.toStatus],
        refuseReason: input.reason,
      },
    });
    if (updated.count !== 1) {
      throw new StoreError("That status change is not allowed.", 409);
    }
    if (input.restoreQuantity && (previous === "pending" || previous === "confirmed")) {
      await tx.meal.update({
        where: { id: order.mealId },
        data: { remainingQuantity: { increment: order.quantity } },
      });
    }
    await bumpDataRevision(tx);
    return { previousFlow: previous, mealId: order.mealId, quantity: order.quantity };
  });
}

export async function recordOrderStatusEvent(input: {
  orderId: string;
  fromStatus: string;
  toStatus: string;
  actorRole: string;
  actorId: string | null;
  reason: string | null;
}): Promise<void> {
  assertDatabaseWriteAllowed("prisma");
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "OrderStatusEvent" (
      "id" TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "fromStatus" TEXT NOT NULL,
      "toStatus" TEXT NOT NULL,
      "actorRole" TEXT NOT NULL,
      "actorId" TEXT,
      "reason" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "OrderStatusEvent" ("id", "orderId", "fromStatus", "toStatus", "actorRole", "actorId", "reason", "createdAt")
    VALUES (${id}, ${input.orderId}, ${input.fromStatus}, ${input.toStatus}, ${input.actorRole}, ${input.actorId}, ${input.reason}, NOW())
  `;
}
