import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { StoreError } from "@/lib/errors";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Optimistic concurrency token for coexistence of full-graph saveGraph
 * and targeted atomic order/meal writes.
 * Atomic writers bump the revision; saveGraph refuses to apply a stale graph.
 */
export async function ensureDataRevisionTable(client: Tx = prisma): Promise<void> {
  await client.$executeRaw`
    CREATE TABLE IF NOT EXISTS app_data_revision (
      id INTEGER PRIMARY KEY DEFAULT 1,
      rev BIGINT NOT NULL DEFAULT 0
    )
  `;
  await client.$executeRaw`
    INSERT INTO app_data_revision (id, rev) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function readDataRevision(client: Tx = prisma): Promise<number> {
  // Read path: do not CREATE TABLE (DDL) — that burns pooler sessions and can
  // fail under transaction mode. Writers still call ensureDataRevisionTable.
  try {
    const rows = await client.$queryRaw<Array<{ rev: bigint | number }>>`
      SELECT rev FROM app_data_revision WHERE id = 1
    `;
    return Number(rows[0]?.rev ?? 0);
  } catch {
    return 0;
  }
}

/** Bump after a successful targeted atomic write. */
export async function bumpDataRevision(client: Tx = prisma): Promise<number> {
  await ensureDataRevisionTable(client);
  const rows = await client.$queryRaw<Array<{ rev: bigint | number }>>`
    UPDATE app_data_revision SET rev = rev + 1 WHERE id = 1 RETURNING rev
  `;
  return Number(rows[0]?.rev ?? 0);
}

/**
 * Assert the in-memory graph still matches the DB revision, then bump.
 * Throws 409 when a concurrent atomic write landed after the graph was loaded.
 */
export async function assertAndBumpDataRevision(
  client: Tx,
  expected: number | undefined,
): Promise<number> {
  await ensureDataRevisionTable(client);
  if (expected === undefined) {
    return bumpDataRevision(client);
  }
  const expectedRev = Number(expected);
  const rows = await client.$queryRaw<Array<{ rev: bigint | number }>>`
    UPDATE app_data_revision
    SET rev = rev + 1
    WHERE id = 1 AND rev = ${expectedRev}
    RETURNING rev
  `;
  if (!rows[0]) {
    throw new StoreError(
      "تعذر حفظ البيانات بسبب تحديث متزامن على الطلبات أو المخزون. أعد المحاولة.",
      409,
    );
  }
  return Number(rows[0].rev);
}
