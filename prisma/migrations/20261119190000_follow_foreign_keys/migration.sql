-- Align Follow with Prisma schema relations (cascade deletes).
-- Forward-only; safe on empty or existing Follow table without FKs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Follow_customerId_fkey'
  ) THEN
    ALTER TABLE "Follow"
      ADD CONSTRAINT "Follow_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Follow_chefId_fkey'
  ) THEN
    ALTER TABLE "Follow"
      ADD CONSTRAINT "Follow_chefId_fkey"
      FOREIGN KEY ("chefId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
