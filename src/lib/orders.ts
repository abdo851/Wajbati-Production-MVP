import { StoreError } from "@/lib/errors";
import type { OrderStatus } from "@/lib/types";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled"],
  assigned: ["picked_up", "confirmed"],
  picked_up: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function statusLabel(status: OrderStatus): string {
  if (status === "picked_up") return "Picked up";
  if (status === "assigned") return "Accepted";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new StoreError("That status change is not allowed.", 409);
  }
}
