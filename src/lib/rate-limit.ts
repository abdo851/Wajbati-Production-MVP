import { assertDatabaseWriteAllowed } from "@/lib/db-guard";
import { prisma } from "@/lib/db/prisma";

const attempts = new Map<string, number[]>();

export type RateLimitFailureMode = "local" | "closed";

/** Process-local sliding-window limiter (fallback / single-instance). */
export function checkRateLimit(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((at) => now - at < windowMs);
  if (list.length >= max) {
    attempts.set(key, list);
    return false;
  }
  list.push(now);
  attempts.set(key, list);
  if (attempts.size > 10_000) attempts.clear();
  return true;
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

let bucketTableReady: Promise<void> | null = null;

async function ensureRateLimitTable(): Promise<void> {
  if (!bucketTableReady) {
    bucketTableReady = (async () => {
      assertDatabaseWriteAllowed("prisma");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
          "key" TEXT PRIMARY KEY,
          "windowStart" TIMESTAMPTZ NOT NULL,
          "count" INTEGER NOT NULL
        )
      `;
    })().catch((error) => {
      bucketTableReady = null;
      throw error;
    });
  }
  await bucketTableReady;
}

/**
 * Shared rate limit using Postgres when the DB write guard allows it.
 * Uses a single atomic UPSERT so concurrent callers cannot exceed `max`.
 *
 * Failure modes:
 * - local (default): fall back to process-local Map when DB/guard unavailable.
 *   Multiple instances can each allow `max` when DB is down (availability trade-off).
 * - closed: deny the request when DB/guard unavailable (required for auth/OTP/admin).
 */
export async function checkRateLimitAsync(
  key: string,
  max = 5,
  windowMs = 60_000,
  failureMode: RateLimitFailureMode = "local",
): Promise<boolean> {
  try {
    await ensureRateLimitTable();
    const cutoff = new Date(Date.now() - windowMs);
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
      VALUES (${key}, NOW(), 1)
      ON CONFLICT ("key") DO UPDATE
      SET
        "windowStart" = CASE
          WHEN "RateLimitBucket"."windowStart" < ${cutoff} THEN NOW()
          ELSE "RateLimitBucket"."windowStart"
        END,
        "count" = CASE
          WHEN "RateLimitBucket"."windowStart" < ${cutoff} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END
      WHERE
        "RateLimitBucket"."windowStart" < ${cutoff}
        OR "RateLimitBucket"."count" < ${max}
      RETURNING "count"
    `;
    return rows.length > 0;
  } catch {
    if (failureMode === "closed") return false;
    return checkRateLimit(key, max, windowMs);
  }
}
