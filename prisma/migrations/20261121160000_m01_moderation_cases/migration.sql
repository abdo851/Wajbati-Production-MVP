-- M0.1 moderation cases — apply only on isolated localhost righ_test.

ALTER TABLE "MarketplaceListing"
ADD COLUMN IF NOT EXISTS "moderation_reason" TEXT,
ADD COLUMN IF NOT EXISTS "previously_approved_at" TIMESTAMPTZ;

ALTER TABLE "ListingReport"
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS "assigned_admin_id" TEXT,
ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "decision_type" TEXT,
ADD COLUMN IF NOT EXISTS "decision_reason" TEXT,
ADD COLUMN IF NOT EXISTS "decided_by_admin_id" TEXT,
ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE "ListingReport" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

CREATE INDEX IF NOT EXISTS "ListingReport_status_updated_at_idx" ON "ListingReport" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "ListingReport_assigned_admin_id_idx" ON "ListingReport" ("assigned_admin_id");

CREATE TABLE IF NOT EXISTS "ModerationCaseNote" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "author_admin_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ModerationCaseNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModerationCaseNote_report_id_created_at_idx"
  ON "ModerationCaseNote" ("report_id", "created_at");

CREATE TABLE IF NOT EXISTS "ModerationCaseEvent" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "actor_role" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ModerationCaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModerationCaseEvent_report_id_created_at_idx"
  ON "ModerationCaseEvent" ("report_id", "created_at");

CREATE TABLE IF NOT EXISTS "ModerationCaseMessage" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "sender_user_id" TEXT NOT NULL,
  "sender_role" TEXT NOT NULL,
  "recipient_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "read_at" TIMESTAMPTZ,
  CONSTRAINT "ModerationCaseMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModerationCaseMessage_report_id_created_at_idx"
  ON "ModerationCaseMessage" ("report_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModerationCaseNote_report_id_fkey'
  ) THEN
    ALTER TABLE "ModerationCaseNote"
      ADD CONSTRAINT "ModerationCaseNote_report_id_fkey"
      FOREIGN KEY ("report_id") REFERENCES "ListingReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModerationCaseEvent_report_id_fkey'
  ) THEN
    ALTER TABLE "ModerationCaseEvent"
      ADD CONSTRAINT "ModerationCaseEvent_report_id_fkey"
      FOREIGN KEY ("report_id") REFERENCES "ListingReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModerationCaseMessage_report_id_fkey'
  ) THEN
    ALTER TABLE "ModerationCaseMessage"
      ADD CONSTRAINT "ModerationCaseMessage_report_id_fkey"
      FOREIGN KEY ("report_id") REFERENCES "ListingReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
