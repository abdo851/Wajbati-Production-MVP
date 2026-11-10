import type { OrderReceipt } from "@/lib/types";

const CHECKOUT_KEY = "wajbati_checkout";
const RECEIPTS_KEY = "wajbati_receipts";

export type SavedCheckout = {
  name: string;
  phone: string;
  address: string;
};

export function readCheckout(): SavedCheckout | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHECKOUT_KEY) ?? "null") as SavedCheckout | null;
    if (!parsed || typeof parsed.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCheckout(value: SavedCheckout) {
  window.localStorage.setItem(CHECKOUT_KEY, JSON.stringify(value));
}

export function readReceipts(): OrderReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECEIPTS_KEY) ?? "[]") as OrderReceipt[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function rememberReceipt(order: OrderReceipt) {
  const next = [order, ...readReceipts().filter((item) => item.id !== order.id)].slice(0, 20);
  window.localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next));
}
