-- Marketplace discovery + seller inquiry availability (isolated/test first).
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "neighborhood" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "MarketplaceListing_city_neighborhood_idx" ON "MarketplaceListing"("city", "neighborhood");

ALTER TABLE "SellerPresence" ADD COLUMN IF NOT EXISTS "accepting_inquiries" BOOLEAN NOT NULL DEFAULT true;
