/**
 * Admin Marketplace / case management store — isolated Prisma only.
 */
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { getMarketplacePrisma } from "@/lib/db/marketplace-prisma-client";
import { StoreError } from "@/lib/errors";
import {
  assertCaseTransition,
  assertDecisionReason,
  assertNoteOrMessageBody,
  isCasePriority,
  isCaseStatus,
  isReportCategory,
  normalizeLegacyCaseStatus,
  OPEN_FAMILY,
  restoreTargetStatus,
  type CaseStatus,
  type ReportCategory,
  type CasePriority,
} from "@/lib/marketplace/case-rules";
import type {
  ListingModerationStatus,
  ListingReportRecord,
  MarketplaceListingRecord,
  ModerationCaseEventRecord,
  ModerationCaseMessageRecord,
  ModerationCaseNoteRecord,
} from "@/lib/marketplace/types";
import { marketplaceStore } from "@/lib/db/marketplace-store";

async function db() {
  return getMarketplacePrisma();
}

type Tx = Prisma.TransactionClient;

async function insertAuditInTx(
  tx: Tx,
  entry: {
    actorId: string;
    actorEmail: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const id = randomUUID();
  const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;
  await tx.$executeRaw`
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
}

function mapCaseReport(row: {
  id: string;
  listingId: string;
  reporterUserId: string;
  reason: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assignedAdminId: string | null;
  assignedAt: Date | null;
  decisionType: string | null;
  decisionReason: string | null;
  decidedByAdminId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ListingReportRecord {
  return {
    id: row.id,
    listingId: row.listingId,
    reporterUserId: row.reporterUserId,
    reason: row.reason,
    description: row.description,
    category: (isReportCategory(row.category) ? row.category : "general") as ReportCategory,
    priority: (isCasePriority(row.priority) ? row.priority : "normal") as CasePriority,
    status: normalizeLegacyCaseStatus(row.status),
    assignedAdminId: row.assignedAdminId,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    decisionType: row.decisionType,
    decisionReason: row.decisionReason,
    decidedByAdminId: row.decidedByAdminId,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const adminMarketplaceStore = {
  async overview() {
    const prisma = await db();
    const [
      activeListings,
      pendingListings,
      openCases,
      activeSellers,
      waitingReporter,
      waitingSeller,
      actionRequired,
      recentAudits,
    ] = await Promise.all([
      prisma.marketplaceListing.count({
        where: {
          isDeleted: false,
          isActive: true,
          isPublished: true,
          moderationStatus: "APPROVED",
        },
      }),
      prisma.marketplaceListing.count({
        where: { isDeleted: false, moderationStatus: "PENDING" },
      }),
      prisma.listingReport.count({ where: { status: { in: [...OPEN_FAMILY] } } }),
      prisma.chefProfile.count({
        where: { isActive: true, user: { approvalStatus: "APPROVED", isDeleted: false, isActive: true } },
      }),
      prisma.listingReport.count({ where: { status: "waiting_for_reporter" } }),
      prisma.listingReport.count({ where: { status: "waiting_for_seller" } }),
      prisma.listingReport.count({ where: { status: { in: ["open", "action_required"] } } }),
      prisma.$queryRaw<
        Array<{ id: string; actorEmail: string; action: string; entityType: string; entityId: string; createdAt: Date }>
      >`SELECT "id", "actorEmail", "action", "entityType", "entityId", "createdAt"
        FROM "AuditLog"
        WHERE "action" IN ('listing.moderation', 'listing.report', 'case.decision', 'case.assign', 'case.note', 'case.message', 'seller.suspend', 'seller.reactivate', 'chef.approval')
        ORDER BY "createdAt" DESC
        LIMIT 20`,
    ]);
    const pendingChefs = await prisma.user.count({
      where: { role: "CHEF", approvalStatus: "PENDING", isDeleted: false },
    });
    return {
      metrics: {
        activeListings,
        pendingListings,
        openCases,
        activeSellers,
        pendingChefs,
        newBuyers: null as number | null,
      },
      queues: {
        casesActionRequired: actionRequired,
        casesWaitingReporter: waitingReporter,
        casesWaitingSeller: waitingSeller,
        pendingListings,
        pendingChefs,
      },
      recentAudit: recentAudits.map((row) => ({
        id: row.id,
        actorEmail: row.actorEmail,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },

  async listCases(input: {
    status?: string;
    priority?: string;
    category?: string;
    q?: string;
    cursor?: string;
    limit?: number;
  }) {
    const prisma = await db();
    const take = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const where: Prisma.ListingReportWhereInput = {};
    if (input.status && isCaseStatus(input.status)) where.status = input.status;
    if (input.priority && isCasePriority(input.priority)) where.priority = input.priority;
    if (input.category && isReportCategory(input.category)) where.category = input.category;
    if (input.q?.trim()) {
      const q = input.q.trim();
      where.OR = [
        { id: { contains: q } },
        { reason: { contains: q, mode: "insensitive" } },
        { reporterUserId: { contains: q } },
        { listingId: { contains: q } },
      ];
    }
    const rows = await prisma.listingReport.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take]?.id : null;
    const page = rows.slice(0, take);
    const listingIds = [...new Set(page.map((r) => r.listingId))];
    const listings = listingIds.length
      ? await prisma.marketplaceListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true, sellerUserId: true, chefProfileId: true },
        })
      : [];
    const listingById = new Map(listings.map((l) => [l.id, l]));
    const sellerIds = [...new Set(listings.map((l) => l.sellerUserId))];
    const chefs = sellerIds.length
      ? await prisma.chefProfile.findMany({
          where: { userId: { in: sellerIds } },
          select: { userId: true, kitchenName: true },
        })
      : [];
    const kitchenBySeller = new Map(chefs.map((c) => [c.userId, c.kitchenName]));
    return {
      cases: page.map((row) => {
        const listing = listingById.get(row.listingId);
        return {
          ...mapCaseReport(row),
          listingTitle: listing?.title ?? null,
          sellerUserId: listing?.sellerUserId ?? null,
          kitchenName: listing ? kitchenBySeller.get(listing.sellerUserId) ?? null : null,
        };
      }),
      nextCursor,
    };
  },

  async getCaseDetail(reportId: string) {
    const prisma = await db();
    const report = await prisma.listingReport.findUnique({ where: { id: reportId } });
    if (!report) throw new StoreError("Case not found.", 404);
    const listing = await prisma.marketplaceListing.findFirst({ where: { id: report.listingId } });
    const seller = listing
      ? await prisma.user.findUnique({
          where: { id: listing.sellerUserId },
          select: {
            id: true,
            fullName: true,
            email: true,
            approvalStatus: true,
            isActive: true,
            chefProfile: { select: { id: true, kitchenName: true, city: true, isActive: true } },
          },
        })
      : null;
    const reporter = await prisma.user.findUnique({
      where: { id: report.reporterUserId },
      select: { id: true, fullName: true, email: true, role: true },
    });
    const [notes, events, messages, relatedReports] = await Promise.all([
      prisma.moderationCaseNote.findMany({ where: { reportId }, orderBy: { createdAt: "asc" } }),
      prisma.moderationCaseEvent.findMany({ where: { reportId }, orderBy: { createdAt: "asc" } }),
      prisma.moderationCaseMessage.findMany({ where: { reportId }, orderBy: { createdAt: "asc" } }),
      prisma.listingReport.count({
        where: { reporterUserId: report.reporterUserId, id: { not: reportId } },
      }),
    ]);
    return {
      case: mapCaseReport(report),
      listing: listing ? await marketplaceStore.getListing(listing.id) : null,
      seller: seller
        ? {
            id: seller.id,
            fullName: seller.fullName,
            email: seller.email,
            approvalStatus: seller.approvalStatus.toLowerCase(),
            isActive: seller.isActive,
            kitchenName: seller.chefProfile?.kitchenName ?? null,
            chefProfileId: seller.chefProfile?.id ?? null,
            city: seller.chefProfile?.city ?? null,
            chefActive: seller.chefProfile?.isActive ?? null,
          }
        : null,
      reporter: reporter
        ? { id: reporter.id, fullName: reporter.fullName, email: reporter.email, role: reporter.role.toLowerCase() }
        : { id: report.reporterUserId, fullName: null, email: null, role: null },
      notes: notes.map(
        (n): ModerationCaseNoteRecord => ({
          id: n.id,
          reportId: n.reportId,
          authorAdminId: n.authorAdminId,
          body: n.body,
          createdAt: n.createdAt.toISOString(),
        }),
      ),
      events: events.map(
        (e): ModerationCaseEventRecord => ({
          id: e.id,
          reportId: e.reportId,
          actorId: e.actorId,
          actorRole: e.actorRole,
          eventType: e.eventType,
          summary: e.summary,
          metadata: e.metadata,
          createdAt: e.createdAt.toISOString(),
        }),
      ),
      messages: messages.map(
        (m): ModerationCaseMessageRecord => ({
          id: m.id,
          reportId: m.reportId,
          senderUserId: m.senderUserId,
          senderRole: m.senderRole as ModerationCaseMessageRecord["senderRole"],
          recipientUserId: m.recipientUserId,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          readAt: m.readAt ? m.readAt.toISOString() : null,
        }),
      ),
      evidence: { available: false, note: "No uploaded evidence on this case." },
      relatedReporterCases: relatedReports,
    };
  },

  async mutateCase(input: {
    reportId: string;
    actorId: string;
    actorEmail: string;
    action: string;
    reason?: string;
    decisionType?: string;
    priority?: string;
    assignedAdminId?: string | null;
    category?: string;
    hideListing?: boolean;
  }) {
    const prisma = await db();
    const existing = await prisma.listingReport.findUnique({ where: { id: input.reportId } });
    if (!existing) throw new StoreError("Case not found.", 404);

    const data: Prisma.ListingReportUpdateInput = { updatedAt: new Date() };
    let eventType = input.action;
    let summary = input.action;
    let nextStatus: CaseStatus | null = null;
    let auditAction = "listing.report";
    const meta: Record<string, unknown> = { action: input.action };

    if (input.action === "start_review") {
      nextStatus = "under_review";
      summary = "Investigation started";
    } else if (input.action === "wait_reporter") {
      nextStatus = "waiting_for_reporter";
      summary = "Waiting for reporter";
    } else if (input.action === "wait_seller") {
      nextStatus = "waiting_for_seller";
      summary = "Waiting for seller";
    } else if (input.action === "mark_action_required") {
      nextStatus = "action_required";
      summary = "Marked action required";
    } else if (input.action === "resolve" || input.action === "dismiss") {
      nextStatus = input.action === "resolve" ? "resolved" : "dismissed";
      const reason = assertDecisionReason(input.reason);
      if (!input.decisionType?.trim()) throw new StoreError("Decision type is required.", 400);
      data.decisionType = input.decisionType.trim();
      data.decisionReason = reason;
      data.decidedByAdminId = input.actorId;
      data.decidedAt = new Date();
      summary = `Case ${nextStatus}: ${reason.slice(0, 120)}`;
      auditAction = "case.decision";
      meta.decisionType = input.decisionType.trim();
      meta.reason = reason;
    } else if (input.action === "reopen") {
      nextStatus = "reopened";
      const reason = assertDecisionReason(input.reason);
      data.decisionType = null;
      data.decisionReason = null;
      data.decidedByAdminId = null;
      data.decidedAt = null;
      summary = `Case reopened: ${reason.slice(0, 120)}`;
      meta.reason = reason;
    } else if (input.action === "assign") {
      data.assignedAdminId = input.assignedAdminId ?? input.actorId;
      data.assignedAt = new Date();
      eventType = "assign";
      summary = `Assigned to ${data.assignedAdminId}`;
      auditAction = "case.assign";
      meta.previous = existing.assignedAdminId;
      meta.next = data.assignedAdminId;
    } else if (input.action === "unassign") {
      meta.previous = existing.assignedAdminId;
      data.assignedAdminId = null;
      data.assignedAt = null;
      eventType = "assign";
      summary = "Assignment cleared";
      auditAction = "case.assign";
    } else if (input.action === "set_priority") {
      if (!input.priority || !isCasePriority(input.priority)) throw new StoreError("Invalid priority.", 400);
      data.priority = input.priority;
      summary = `Priority set to ${input.priority}`;
    } else if (input.action === "set_category") {
      if (!input.category || !isReportCategory(input.category)) throw new StoreError("Invalid category.", 400);
      data.category = input.category;
      summary = `Category set to ${input.category}`;
    } else if (input.action === "hide_listing") {
      const reason = assertDecisionReason(input.reason);
      summary = `Listing hidden from case: ${reason.slice(0, 120)}`;
      meta.reason = reason;
      meta.hideListing = true;
    } else {
      throw new StoreError("Unknown case action.", 400);
    }

    if (nextStatus) {
      assertCaseTransition(existing.status, nextStatus);
      data.status = nextStatus;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.action === "hide_listing") {
        const listing = await tx.marketplaceListing.findFirst({ where: { id: existing.listingId, isDeleted: false } });
        if (!listing) throw new StoreError("Listing not found.", 404);
        await tx.marketplaceListing.update({
          where: { id: listing.id },
          data: {
            moderationStatus: "HIDDEN",
            moderationReason: assertDecisionReason(input.reason),
            updatedAt: new Date(),
          },
        });
      }
      const row = await tx.listingReport.update({ where: { id: input.reportId }, data });
      await tx.moderationCaseEvent.create({
        data: {
          id: randomUUID(),
          reportId: input.reportId,
          actorId: input.actorId,
          actorRole: "admin",
          eventType,
          summary,
          metadata: JSON.stringify(meta),
        },
      });
      try {
        await insertAuditInTx(tx, {
          actorId: input.actorId,
          actorEmail: input.actorEmail,
          action: auditAction,
          entityType: "ListingReport",
          entityId: input.reportId,
          metadata: meta,
        });
      } catch (error) {
        console.warn(
          "[audit] case mutation audit insert failed inside transaction",
          error instanceof Error ? error.message : "unknown",
        );
        throw error;
      }
      return row;
    });

    return mapCaseReport(updated);
  },

  async addNote(input: { reportId: string; authorAdminId: string; actorEmail: string; body: string }) {
    const prisma = await db();
    const body = assertNoteOrMessageBody(input.body, "Note");
    const existing = await prisma.listingReport.findUnique({ where: { id: input.reportId } });
    if (!existing) throw new StoreError("Case not found.", 404);
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.moderationCaseNote.create({
        data: {
          id: randomUUID(),
          reportId: input.reportId,
          authorAdminId: input.authorAdminId,
          body,
        },
      });
      await tx.listingReport.update({ where: { id: input.reportId }, data: { updatedAt: new Date() } });
      await tx.moderationCaseEvent.create({
        data: {
          id: randomUUID(),
          reportId: input.reportId,
          actorId: input.authorAdminId,
          actorRole: "admin",
          eventType: "note",
          summary: "Internal note added",
          metadata: null,
        },
      });
      await insertAuditInTx(tx, {
        actorId: input.authorAdminId,
        actorEmail: input.actorEmail,
        action: "case.note",
        entityType: "ListingReport",
        entityId: input.reportId,
      });
      return created;
    });
    return {
      id: note.id,
      reportId: note.reportId,
      authorAdminId: note.authorAdminId,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    } satisfies ModerationCaseNoteRecord;
  },

  async addCaseMessage(input: {
    reportId: string;
    senderUserId: string;
    senderRole: "admin" | "reporter" | "seller";
    recipient: "reporter" | "seller" | "admin";
    recipientUserId?: string;
    body: string;
    actorEmail?: string;
  }) {
    const prisma = await db();
    const body = assertNoteOrMessageBody(input.body);
    const report = await prisma.listingReport.findUnique({ where: { id: input.reportId } });
    if (!report) throw new StoreError("Case not found.", 404);
    const listing = await prisma.marketplaceListing.findFirst({ where: { id: report.listingId } });
    if (!listing) throw new StoreError("Listing not found.", 404);

    let recipientUserId = input.recipientUserId ?? "";
    if (input.senderRole === "admin") {
      if (input.recipient === "reporter") recipientUserId = report.reporterUserId;
      else if (input.recipient === "seller") recipientUserId = listing.sellerUserId;
      else throw new StoreError("Admin must message reporter or seller.", 400);
    } else {
      // Participant reply → admin assignee or leave recipient as provided admin id
      if (input.senderRole === "reporter" && input.senderUserId !== report.reporterUserId) {
        throw new StoreError("Not allowed.", 403);
      }
      if (input.senderRole === "seller" && input.senderUserId !== listing.sellerUserId) {
        throw new StoreError("Not allowed.", 403);
      }
      recipientUserId = report.assignedAdminId || input.recipientUserId || "admin-desk";
    }

    if (input.senderRole === "admin") {
      if (recipientUserId !== report.reporterUserId && recipientUserId !== listing.sellerUserId) {
        throw new StoreError("Invalid message recipient.", 400);
      }
    } else if (recipientUserId !== report.assignedAdminId && recipientUserId !== "admin-desk") {
      throw new StoreError("Invalid message recipient.", 400);
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.moderationCaseMessage.create({
        data: {
          id: randomUUID(),
          reportId: input.reportId,
          senderUserId: input.senderUserId,
          senderRole: input.senderRole,
          recipientUserId,
          body,
        },
      });
      await tx.listingReport.update({ where: { id: input.reportId }, data: { updatedAt: new Date() } });
      await tx.moderationCaseEvent.create({
        data: {
          id: randomUUID(),
          reportId: input.reportId,
          actorId: input.senderUserId,
          actorRole: input.senderRole,
          eventType: "message",
          summary: `Message from ${input.senderRole}`,
          metadata: JSON.stringify({ recipientUserId }),
        },
      });
      if (input.senderRole === "admin" && input.actorEmail) {
        await insertAuditInTx(tx, {
          actorId: input.senderUserId,
          actorEmail: input.actorEmail,
          action: "case.message",
          entityType: "ListingReport",
          entityId: input.reportId,
          metadata: { recipientUserId },
        });
      }
      return created;
    });

    // Best-effort notification (skip desk placeholder — not a real user id)
    if (recipientUserId !== "admin-desk") {
      try {
        await prisma.appNotification.create({
          data: {
            id: randomUUID(),
            userId: recipientUserId,
            kind: "case.message",
            title: "Case update",
            body: body.slice(0, 180),
            href:
              input.senderRole === "admin"
                ? `/account/cases?caseId=${input.reportId}`
                : `/admin?section=reports&caseId=${input.reportId}`,
            dedupeKey: `case.msg.${message.id}`,
          },
        });
      } catch {
        /* ignore duplicate/notify failures */
      }
    }

    return {
      id: message.id,
      reportId: message.reportId,
      senderUserId: message.senderUserId,
      senderRole: message.senderRole as ModerationCaseMessageRecord["senderRole"],
      recipientUserId: message.recipientUserId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: null,
    } satisfies ModerationCaseMessageRecord;
  },

  async listParticipantCases(userId: string) {
    const prisma = await db();
    const sellerListings = await prisma.marketplaceListing.findMany({
      where: { sellerUserId: userId },
      select: { id: true },
    });
    const listingIds = sellerListings.map((l) => l.id);
    const rows = await prisma.listingReport.findMany({
      where: {
        OR: [{ reporterUserId: userId }, ...(listingIds.length ? [{ listingId: { in: listingIds } }] : [])],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return rows.map(mapCaseReport);
  },

  async assertParticipantAccess(reportId: string, userId: string) {
    const prisma = await db();
    const report = await prisma.listingReport.findUnique({ where: { id: reportId } });
    if (!report) throw new StoreError("Case not found.", 404);
    const listing = await prisma.marketplaceListing.findFirst({ where: { id: report.listingId } });
    if (!listing) throw new StoreError("Listing not found.", 404);
    const role =
      userId === report.reporterUserId ? "reporter" : userId === listing.sellerUserId ? "seller" : null;
    if (!role) throw new StoreError("Not allowed.", 403);
    return { report, listing, role: role as "reporter" | "seller" };
  },

  async listListings(input: {
    q?: string;
    city?: string;
    category?: string;
    kind?: string;
    availability?: string;
    priceMode?: string;
    moderationStatus?: string;
    seller?: string;
    cursor?: string;
    limit?: number;
  }) {
    const prisma = await db();
    const take = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const where: Prisma.MarketplaceListingWhereInput = { isDeleted: false };
    if (input.city) where.city = { contains: input.city, mode: "insensitive" };
    if (input.category) where.category = input.category;
    if (input.moderationStatus) {
      const map: Record<string, "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN"> = {
        pending: "PENDING",
        approved: "APPROVED",
        rejected: "REJECTED",
        hidden: "HIDDEN",
      };
      where.moderationStatus = map[input.moderationStatus] ?? undefined;
    }
    if (input.kind === "temporary") where.kind = "TEMPORARY";
    if (input.kind === "permanent") where.kind = "PERMANENT";
    if (input.q?.trim()) {
      where.OR = [
        { title: { contains: input.q.trim(), mode: "insensitive" } },
        { sellerUserId: { contains: input.q.trim() } },
      ];
    }
    if (input.seller?.trim()) {
      const sellerQ = input.seller.trim();
      const chefs = await prisma.chefProfile.findMany({
        where: { kitchenName: { contains: sellerQ, mode: "insensitive" } },
        select: { userId: true },
        take: 50,
      });
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : []),
        { sellerUserId: { contains: sellerQ } },
        ...(chefs.length ? [{ sellerUserId: { in: chefs.map((c) => c.userId) } }] : []),
      ];
    }
    const rows = await prisma.marketplaceListing.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take]?.id : null;
    const page = rows.slice(0, take);
    const mapped = await Promise.all(page.map((row) => marketplaceStore.getListing(row.id)));
    return { listings: mapped.filter(Boolean) as MarketplaceListingRecord[], nextCursor };
  },

  async moderateListing(input: {
    listingId: string;
    action: "approve" | "reject" | "hide" | "restore";
    reason?: string;
    actorId: string;
    actorEmail: string;
  }) {
    const prisma = await db();
    const listing = await prisma.marketplaceListing.findFirst({
      where: { id: input.listingId, isDeleted: false },
    });
    if (!listing) throw new StoreError("Listing not found.", 404);

    let moderationStatus: ListingModerationStatus = "pending";
    let moderationReason: string | null = listing.moderationReason;
    let previouslyApprovedAt = listing.previouslyApprovedAt;
    let isPublished = listing.isPublished;

    if (input.action === "approve") {
      moderationStatus = "approved";
      if (!previouslyApprovedAt) previouslyApprovedAt = new Date();
      moderationReason = null;
    } else if (input.action === "reject") {
      moderationStatus = "rejected";
      moderationReason = assertDecisionReason(input.reason);
      isPublished = false;
    } else if (input.action === "hide") {
      moderationStatus = "hidden";
      moderationReason = assertDecisionReason(input.reason);
    } else if (input.action === "restore") {
      if (modOut(listing.moderationStatus) !== "hidden") {
        throw new StoreError("Only hidden listings can be restored.", 400);
      }
      moderationReason = assertDecisionReason(input.reason);
      moderationStatus = restoreTargetStatus(previouslyApprovedAt);
    } else {
      throw new StoreError("Unknown moderation action.", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.marketplaceListing.update({
        where: { id: input.listingId },
        data: {
          moderationStatus:
            moderationStatus === "approved"
              ? "APPROVED"
              : moderationStatus === "rejected"
                ? "REJECTED"
                : moderationStatus === "hidden"
                  ? "HIDDEN"
                  : "PENDING",
          moderationReason,
          previouslyApprovedAt,
          isPublished,
          updatedAt: new Date(),
        },
      });
      await insertAuditInTx(tx, {
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        action: "listing.moderation",
        entityType: "MarketplaceListing",
        entityId: input.listingId,
        metadata: { action: input.action, moderationStatus, reason: moderationReason },
      });
      return row;
    });

    // Idempotent first-public follower notify
    if (
      updated.isPublished &&
      updated.moderationStatus === "APPROVED" &&
      updated.isActive &&
      !updated.isDeleted
    ) {
      await notifyFollowersFirstPublic(updated.id, updated.sellerUserId, updated.title);
    }

    return marketplaceStore.getListing(updated.id);
  },

  async listSellers(input: { q?: string; city?: string; status?: string; cursor?: string; limit?: number }) {
    const prisma = await db();
    const take = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const where: Prisma.UserWhereInput = { role: "CHEF", isDeleted: false };
    if (input.status === "pending") where.approvalStatus = "PENDING";
    if (input.status === "approved") where.approvalStatus = "APPROVED";
    if (input.status === "rejected") where.approvalStatus = "REJECTED";
    if (input.status === "suspended") where.isActive = false;
    if (input.q?.trim()) {
      const q = input.q.trim();
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { chefProfile: { kitchenName: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (input.city?.trim()) {
      where.chefProfile = {
        is: { city: { contains: input.city.trim(), mode: "insensitive" } },
      };
    }
    const rows = await prisma.user.findMany({
      where,
      include: { chefProfile: true },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take]?.id : null;
    const page = rows.slice(0, take);
    const sellerIds = page.map((u) => u.id);
    const listingCounts = sellerIds.length
      ? await prisma.marketplaceListing.groupBy({
          by: ["sellerUserId", "moderationStatus"],
          where: { sellerUserId: { in: sellerIds }, isDeleted: false },
          _count: true,
        })
      : [];
    return {
      sellers: page.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        approvalStatus: u.approvalStatus.toLowerCase(),
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        kitchenName: u.chefProfile?.kitchenName ?? "",
        city: u.chefProfile?.city ?? "",
        chefProfileId: u.chefProfile?.id ?? null,
        listingCounts: listingCounts
          .filter((c) => c.sellerUserId === u.id)
          .map((c) => ({ status: c.moderationStatus.toLowerCase(), count: c._count })),
      })),
      nextCursor,
    };
  },

  async getSellerDetail(userId: string) {
    const prisma = await db();
    const user = await prisma.user.findFirst({
      where: { id: userId, role: "CHEF", isDeleted: false },
      include: { chefProfile: true },
    });
    if (!user) throw new StoreError("Seller not found.", 404);
    const listings = await prisma.marketplaceListing.findMany({
      where: { sellerUserId: userId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const listingIds = listings.map((l) => l.id);
    const reports = listingIds.length
      ? await prisma.listingReport.findMany({
          where: { listingId: { in: listingIds } },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
    return {
      seller: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        approvalStatus: user.approvalStatus.toLowerCase(),
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        kitchenName: user.chefProfile?.kitchenName ?? "",
        city: user.chefProfile?.city ?? "",
        bio: user.chefProfile?.bio ?? null,
        chefProfileId: user.chefProfile?.id ?? null,
        hasCin: Boolean(user.chefProfile?.cinStoragePath),
        hasAutoEntrepreneur: Boolean(user.chefProfile?.autoEntrepreneurNumber),
        gallery: user.chefProfile?.gallery ?? [],
        averageRating: user.chefProfile?.averageRating ?? 0,
      },
      listings: await Promise.all(listings.map((l) => marketplaceStore.getListing(l.id))),
      reports: reports.map(mapCaseReport),
    };
  },

  async setSellerActive(input: {
    userId: string;
    active: boolean;
    reason: string;
    actorId: string;
    actorEmail: string;
  }) {
    const prisma = await db();
    const reason = assertDecisionReason(input.reason);
    const user = await prisma.user.findFirst({
      where: { id: input.userId, role: "CHEF", isDeleted: false },
      include: { chefProfile: true },
    });
    if (!user) throw new StoreError("Seller not found.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { isActive: input.active } });
      if (user.chefProfile) {
        await tx.chefProfile.update({
          where: { id: user.chefProfile.id },
          data: { isActive: input.active },
        });
      }
      await insertAuditInTx(tx, {
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        action: input.active ? "seller.reactivate" : "seller.suspend",
        entityType: "User",
        entityId: user.id,
        metadata: { reason },
      });
    });
    return this.getSellerDetail(user.id);
  },
};

function modOut(value: string): ListingModerationStatus {
  if (value === "APPROVED") return "approved";
  if (value === "REJECTED") return "rejected";
  if (value === "HIDDEN") return "hidden";
  return "pending";
}

async function notifyFollowersFirstPublic(listingId: string, sellerUserId: string, title: string) {
  const prisma = await db();
  const follows = await prisma.follow.findMany({
    where: { chefId: sellerUserId },
    select: { customerId: true },
    take: 200,
  });
  for (const follow of follows) {
    try {
      await prisma.appNotification.create({
        data: {
          id: randomUUID(),
          userId: follow.customerId,
          kind: "listing.public",
          title: "New dish available",
          body: title,
          href: `/?listing=${listingId}`,
          dedupeKey: `listing.public.first:${listingId}`,
        },
      });
    } catch {
      /* unique dedupe — idempotent */
    }
  }
}
