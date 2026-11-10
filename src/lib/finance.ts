import { todayInCasablanca, roundMoney, weekStartInCasablanca } from "@/lib/format";
import type { FinanceSummary, OrderStatus } from "@/lib/types";

type MoneyRow = {
  status: OrderStatus;
  quantity: number;
  totalMad: number;
  commissionMad: number;
  deliveryFeeMad: number;
  driverCommissionMad: number;
  createdAt: string;
};

export function financeOf(rows: MoneyRow[]): FinanceSummary {
  const live = rows.filter((row) => row.status !== "cancelled");
  const portions = live.reduce((sum, row) => sum + row.quantity, 0);
  const meals = live.reduce((sum, row) => sum + row.totalMad, 0);
  const delivery = live.reduce((sum, row) => sum + row.deliveryFeeMad, 0);
  const commission = live.reduce((sum, row) => sum + row.commissionMad, 0);
  const driverPlatform = live.reduce((sum, row) => sum + row.driverCommissionMad, 0);
  return {
    orders: live.length,
    portions,
    cashCollectedMad: roundMoney(meals + delivery),
    platformCommissionMad: roundMoney(commission),
    chefPayoutMad: roundMoney(meals - commission),
    driverEarningsMad: roundMoney(delivery - driverPlatform),
    deliveryPlatformMad: roundMoney(driverPlatform),
  };
}

export function rowsOnDate(rows: MoneyRow[], day: string): MoneyRow[] {
  return rows.filter((row) => todayInCasablanca(new Date(row.createdAt)) === day);
}

export function rowsThisWeek(rows: MoneyRow[], now = new Date()): MoneyRow[] {
  const start = weekStartInCasablanca(now);
  const end = todayInCasablanca(now);
  return rows.filter((row) => {
    const day = todayInCasablanca(new Date(row.createdAt));
    return day >= start && day <= end;
  });
}
