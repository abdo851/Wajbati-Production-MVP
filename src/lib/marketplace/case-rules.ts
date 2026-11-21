import { StoreError } from "@/lib/errors";

export const REPORT_CATEGORIES = [
  "spam",
  "fraud",
  "inappropriate",
  "misleading",
  "other",
  "general",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const CASE_STATUSES = [
  "open",
  "under_review",
  "waiting_for_reporter",
  "waiting_for_seller",
  "action_required",
  "resolved",
  "dismissed",
  "reopened",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export const OPEN_FAMILY: readonly CaseStatus[] = [
  "open",
  "under_review",
  "waiting_for_reporter",
  "waiting_for_seller",
  "action_required",
  "reopened",
];

const ALLOWED: Record<CaseStatus, readonly CaseStatus[]> = {
  open: ["under_review", "dismissed"],
  under_review: ["waiting_for_reporter", "waiting_for_seller", "action_required", "resolved", "dismissed"],
  waiting_for_reporter: ["under_review", "action_required"],
  waiting_for_seller: ["under_review", "action_required"],
  action_required: ["under_review", "resolved", "dismissed"],
  resolved: ["reopened"],
  dismissed: ["reopened"],
  reopened: ["under_review"],
};

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isCaseStatus(value: string): value is CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(value);
}

export function isCasePriority(value: string): value is CasePriority {
  return (CASE_PRIORITIES as readonly string[]).includes(value);
}

export function normalizeLegacyCaseStatus(status: string): CaseStatus {
  if (isCaseStatus(status)) return status;
  if (status === "resolved" || status === "dismissed") return status;
  return "open";
}

export function assertCaseTransition(from: string, to: CaseStatus): void {
  const current = normalizeLegacyCaseStatus(from);
  if (current === to) return;
  const allowed = ALLOWED[current] ?? [];
  if (!allowed.includes(to)) {
    throw new StoreError(`Invalid case transition from ${current} to ${to}.`, 400);
  }
}

export function assertDecisionReason(reason: string | undefined | null): string {
  const value = (reason ?? "").trim();
  if (value.length < 10) throw new StoreError("A documented decision reason of at least 10 characters is required.", 400);
  if (value.length > 2000) throw new StoreError("Decision reason is too long.", 400);
  return value;
}

export function assertNoteOrMessageBody(body: string, label = "Message"): string {
  const value = body.trim();
  if (value.length < 5) throw new StoreError(`${label} must be at least 5 characters.`, 400);
  if (value.length > 2000) throw new StoreError(`${label} is too long.`, 400);
  return value;
}

/** D2: restore target from hidden, based on prior approval history. */
export function restoreTargetStatus(previouslyApprovedAt: Date | string | null | undefined): "approved" | "pending" {
  return previouslyApprovedAt ? "approved" : "pending";
}
