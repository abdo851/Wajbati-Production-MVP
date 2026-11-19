/** Order-scoped direct chat thread helpers (no schema change). */

export type OrderChatPeer = "chef" | "driver";

export type OrderChatActor = {
  role: string;
  chefId?: string | null;
  driverId?: string | null;
  phone?: string | null;
};

export type OrderChatOrder = {
  chefId: string;
  driverId: string | null;
  customerPhone: string;
};

export function parseOrderThreadId(
  threadId: string,
): { orderId: string; peer: OrderChatPeer } | null {
  const chef = /^order:([^:]+):chef$/.exec(threadId);
  if (chef?.[1]) return { orderId: chef[1], peer: "chef" };
  const driver = /^order:([^:]+)$/.exec(threadId);
  if (driver?.[1]) return { orderId: driver[1], peer: "driver" };
  return null;
}

export function orderThreadId(orderId: string, peer: OrderChatPeer): string {
  return peer === "chef" ? `order:${orderId}:chef` : `order:${orderId}`;
}

export function defaultOrderChatPeer(role: string): OrderChatPeer {
  if (role === "driver") return "driver";
  return "chef";
}

export function parseOrderChatPeer(value: unknown): OrderChatPeer | null {
  if (value === "chef" || value === "driver") return value;
  return null;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Pure authorization for order-scoped chef/driver threads. */
export function canAccessOrderChat(
  actor: OrderChatActor,
  order: OrderChatOrder,
  peer: OrderChatPeer,
): boolean {
  if (actor.role === "customer") {
    const phone = onlyDigits(actor.phone ?? "");
    return phone.length >= 8 && phone === onlyDigits(order.customerPhone);
  }
  if (peer === "driver") {
    return Boolean(actor.role === "driver" && actor.driverId && order.driverId === actor.driverId);
  }
  return Boolean(actor.role === "chef" && actor.chefId && order.chefId === actor.chefId);
}

/** Chef and driver order threads must never share an id. */
export function orderChatThreadsCollide(orderId: string): boolean {
  return orderThreadId(orderId, "chef") === orderThreadId(orderId, "driver");
}
