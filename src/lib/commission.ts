import { assertOwnerFinancialRulesApproved } from "@/lib/financial-rules";
import { roundMoney } from "@/lib/format";

export type OrderFees = {
  chefPerPortionMad: number;
  driverPerPortionMad: number;
  chefServiceFee: number;
  driverCommission: number;
  platformRevenue: number;
};

/**
 * FROZEN — amounts previously proposed in code are NOT owner-approved.
 * Calling this fails closed until OWNER_FINANCIAL_RULES_APPROVED is set after an owner decision.
 */
export function calculateOrderFees(mealPrice: number, quantity: number): OrderFees {
  assertOwnerFinancialRulesApproved("calculateOrderFees");
  // Unreachable until the owner unlocks financial rules and supplies approved amounts.
  void mealPrice;
  void quantity;
  return {
    chefPerPortionMad: 0,
    driverPerPortionMad: 0,
    chefServiceFee: 0,
    driverCommission: 0,
    platformRevenue: 0,
  };
}

/** @deprecated Use calculateOrderFees only after owner approval. Kept name for older imports. */
export function calculateDynamicCommission(mealPrice: number, quantity: number): OrderFees {
  return calculateOrderFees(mealPrice, quantity);
}

export function roundFee(value: number) {
  return roundMoney(value);
}
