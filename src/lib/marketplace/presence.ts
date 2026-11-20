import type { SellerPresenceRecord } from "@/lib/marketplace/types";

/** Online window for server-authoritative presence (milliseconds). */
export const SELLER_PRESENCE_TTL_MS = 90_000;

export function sellerIsOnline(presence: SellerPresenceRecord | undefined, now = Date.now()): boolean {
  if (!presence) return false;
  return now - Date.parse(presence.lastSeenAt) <= SELLER_PRESENCE_TTL_MS;
}
