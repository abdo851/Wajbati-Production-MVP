-- Phase 2 proposed migration for an ISOLATED development database only.
-- DO NOT apply to production Neon without explicit owner approval.
-- Aligns schema.prisma gaps + operational audit/rate-limit/history tables.

-- Enum extensions
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUSED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'NOT_REACHABLE';
ALTER TYPE "WalletTxnType" ADD VALUE IF NOT EXISTS 'PENALTY';

-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- ChefProfile
ALTER TABLE "ChefProfile" ADD COLUMN IF NOT EXISTS "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ChefProfile" ADD COLUMN IF NOT EXISTS "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- DriverProfile
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Meal
ALTER TABLE "Meal" ADD COLUMN IF NOT EXISTS "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Meal" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Meal" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Order operational / OTP / fees / soft-delete
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "otpHash" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "otpExpiry" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "otpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "refuseReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryLat" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryLng" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "chefServiceFee" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "driverCommission" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "review" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Follow graph
CREATE TABLE IF NOT EXISTS "Follow" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chefId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Follow_customerId_chefId_key" ON "Follow"("customerId", "chefId");
CREATE INDEX IF NOT EXISTS "Follow_customerId_idx" ON "Follow"("customerId");
CREATE INDEX IF NOT EXISTS "Follow_chefId_idx" ON "Follow"("chefId");

-- Admin audit log
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- Order status history
CREATE TABLE IF NOT EXISTS "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderStatusEvent_orderId_idx" ON "OrderStatusEvent"("orderId");

-- Distributed rate-limit buckets (Postgres-backed)
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
