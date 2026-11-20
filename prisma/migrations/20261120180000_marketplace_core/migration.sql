-- Marketplace Phase 2 core tables.
-- APPLY ONLY on an isolated localhost test database (RIGH_TEST_DATABASE_URL).
-- DO NOT apply to production Supabase/Neon without explicit owner approval.

CREATE TYPE "ListingKind" AS ENUM ('PERMANENT', 'TEMPORARY');
CREATE TYPE "ListingPriceMode" AS ENUM ('FIXED', 'NEGOTIABLE', 'HIDDEN');
CREATE TYPE "ListingAvailability" AS ENUM ('AVAILABLE', 'PREORDER', 'UNAVAILABLE', 'SOLD_OUT');
CREATE TYPE "ListingModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "chef_profile_id" TEXT NOT NULL,
    "seller_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'home',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kind" "ListingKind" NOT NULL DEFAULT 'PERMANENT',
    "price_mode" "ListingPriceMode" NOT NULL,
    "price_mad" DOUBLE PRECISION,
    "availability" "ListingAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "moderation_status" "ListingModerationStatus" NOT NULL DEFAULT 'PENDING',
    "city" TEXT NOT NULL DEFAULT '',
    "expires_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceListing_chef_profile_id_idx" ON "MarketplaceListing"("chef_profile_id");
CREATE INDEX "MarketplaceListing_seller_user_id_idx" ON "MarketplaceListing"("seller_user_id");
CREATE INDEX "MarketplaceListing_city_idx" ON "MarketplaceListing"("city");
CREATE INDEX "MarketplaceListing_is_published_moderation_status_availability_idx" ON "MarketplaceListing"("is_published", "moderation_status", "availability");
CREATE INDEX "MarketplaceListing_expires_at_idx" ON "MarketplaceListing"("expires_at");

CREATE TABLE "MarketplaceConversation" (
    "id" TEXT NOT NULL,
    "buyer_user_id" TEXT NOT NULL,
    "seller_user_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "buyer_unread" INTEGER NOT NULL DEFAULT 0,
    "seller_unread" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceConversation_buyer_user_id_seller_user_id_key" ON "MarketplaceConversation"("buyer_user_id", "seller_user_id");
CREATE INDEX "MarketplaceConversation_buyer_user_id_idx" ON "MarketplaceConversation"("buyer_user_id");
CREATE INDEX "MarketplaceConversation_seller_user_id_idx" ON "MarketplaceConversation"("seller_user_id");

CREATE TABLE "MarketplaceMessage" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceMessage_conversation_id_created_at_idx" ON "MarketplaceMessage"("conversation_id", "created_at");
CREATE INDEX "MarketplaceMessage_sender_user_id_idx" ON "MarketplaceMessage"("sender_user_id");

ALTER TABLE "MarketplaceMessage" ADD CONSTRAINT "MarketplaceMessage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "MarketplaceConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SellerPresence" (
    "seller_user_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SellerPresence_pkey" PRIMARY KEY ("seller_user_id")
);

CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "read_at" TIMESTAMP(3),
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppNotification_user_id_created_at_idx" ON "AppNotification"("user_id", "created_at");
CREATE UNIQUE INDEX "AppNotification_user_id_dedupe_key_key" ON "AppNotification"("user_id", "dedupe_key");

CREATE TABLE "ListingReport" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "reporter_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingReport_listing_id_idx" ON "ListingReport"("listing_id");
CREATE INDEX "ListingReport_status_idx" ON "ListingReport"("status");
