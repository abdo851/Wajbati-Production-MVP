import { StoreError } from "@/lib/errors";
import { roundMoney } from "@/lib/format";

/**
 * Owner has NOT approved final wallet fee / delivery-fee amounts.
 * Flip to true only after an explicit owner decision (and never invent numbers here).
 */
export const OWNER_FINANCIAL_RULES_APPROVED = false;

/** COD meal cash only — unit price × portions. No delivery fee included. */
export function cashMealTotalMad(unitPriceMad: number, quantity: number): number {
  return roundMoney(Math.max(0, unitPriceMad) * Math.max(0, Math.floor(quantity)));
}

/**
 * Wallet commissions, chef service fees, driver fee deductions, and a separate
 * delivery fee amount are frozen until the owner approves numbers.
 */
export function assertOwnerFinancialRulesApproved(operation: string): void {
  if (OWNER_FINANCIAL_RULES_APPROVED) return;
  throw new StoreError(
    `القواعد المالية غير معتمدة بعد (${operation}). لا تُطبَّق عمولات المحفظة ولا رسوم توصيل منفصلة حتى يوافق المالك على الأرقام.`,
    503,
  );
}
