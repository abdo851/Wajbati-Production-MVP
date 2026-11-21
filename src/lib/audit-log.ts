import { assertDatabaseWriteAllowed } from "@/lib/db-guard";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";

export type AuditAction =
  | "wallet.adjust"
  | "chef.approval"
  | "chef.deactivate"
  | "driver.approval"
  | "driver.deactivate"
  | "order.admin_resolve"
  | "settings.commission"
  | "admin.account_update"
  | "listing.moderation"
  | "listing.report"
  | "case.decision"
  | "case.assign"
  | "case.note"
  | "case.message"
  | "seller.suspend"
  | "seller.reactivate";

export type AuditEntry = {
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Non-secret before/after metadata only. */
  metadata?: Record<string, unknown>;
};

let tableReady: Promise<void> | null = null;

async function ensureAuditTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      assertDatabaseWriteAllowed("prisma");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "AuditLog" (
          "id" TEXT PRIMARY KEY,
          "actorId" TEXT NOT NULL,
          "actorEmail" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          "metadata" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog" ("actorId")
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "AuditLog_entity_idx" ON "AuditLog" ("entityType", "entityId")
      `;
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

/**
 * Persist a sensitive admin action. Never include passwords, tokens, OTP, or document bytes.
 * Best-effort: logs a warning if the write cannot be completed.
 */
export async function recordAdminAudit(entry: AuditEntry): Promise<void> {
  try {
    await ensureAuditTable();
    const id = randomUUID();
    const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;
    await prisma.$executeRaw`
      INSERT INTO "AuditLog" ("id", "actorId", "actorEmail", "action", "entityType", "entityId", "metadata", "createdAt")
      VALUES (
        ${id},
        ${entry.actorId},
        ${entry.actorEmail},
        ${entry.action},
        ${entry.entityType},
        ${entry.entityId},
        ${metadata},
        NOW()
      )
    `;
  } catch (error) {
    console.warn(
      "[audit] could not persist admin audit row",
      error instanceof Error ? error.message : "unknown",
    );
  }
}
