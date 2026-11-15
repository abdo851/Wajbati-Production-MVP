import { roundMoney } from "@/lib/format";

export type DynamicCommission = {
  chefPerPortionMad: number;
  driverPerPortionMad: number;
  chefCommissionMad: number;
  driverCommissionMad: number;
  platformCommissionMad: number;
};

/** Tiered Uber-style fees charged to chef and driver wallets per portion. */
export function calculateDynamicCommission(mealPrice: number, quantity: number): DynamicCommission {
  const portions = Math.max(0, Math.floor(quantity));
  let chefPerPortionMad = 1;
  let driverPerPortionMad = 1;
  if (mealPrice >= 60) {
    chefPerPortionMad = 3;
    driverPerPortionMad = 3;
  } else if (mealPrice >= 30) {
    chefPerPortionMad = 2;
    driverPerPortionMad = 2;
  }
  const chefCommissionMad = roundMoney(chefPerPortionMad * portions);
  const driverCommissionMad = roundMoney(driverPerPortionMad * portions);
  return {
    chefPerPortionMad,
    driverPerPortionMad,
    chefCommissionMad,
    driverCommissionMad,
    platformCommissionMad: roundMoney(chefCommissionMad + driverCommissionMad),
  };
}
