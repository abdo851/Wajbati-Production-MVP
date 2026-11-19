import { StoreError } from "@/lib/errors";
import type { OrderStatus } from "@/lib/types";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "assigned"],
  assigned: ["picked_up", "confirmed", "refused", "not_reachable"],
  picked_up: ["delivered", "refused", "not_reachable"],
  delivered: [],
  cancelled: [],
  refused: [],
  not_reachable: [],
};

/** Terminal outcomes that must never become delivered afterwards. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["delivered", "cancelled", "refused", "not_reachable"];

export type OrderClosureParty = "customer" | "chef" | "driver" | "admin" | "system";

export function statusLabel(status: OrderStatus): string {
  if (status === "picked_up") return "Picked up";
  if (status === "assigned") return "Accepted";
  if (status === "not_reachable") return "Not reachable";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new StoreError("That status change is not allowed.", 409);
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/** Cancellation before the chef marks the order ready/confirmed. */
export function isPrePreparationCancel(from: OrderStatus, to: OrderStatus): boolean {
  return to === "cancelled" && from === "pending";
}

/** Cancellation after preparation has started (confirmed or later non-terminal). */
export function isPostPreparationCancel(from: OrderStatus, to: OrderStatus): boolean {
  return to === "cancelled" && from !== "pending" && !isTerminalOrderStatus(from);
}

export function formatClosureReason(party: OrderClosureParty, detail: string): string {
  const clean = detail.trim().slice(0, 160) || "unspecified";
  return `[${party}] ${clean}`;
}

export function parseClosureParty(reason: string | null | undefined): OrderClosureParty | null {
  if (!reason) return null;
  const match = /^\[(customer|chef|driver|admin|system)\]\s*/i.exec(reason);
  if (!match) return null;
  return match[1].toLowerCase() as OrderClosureParty;
}
