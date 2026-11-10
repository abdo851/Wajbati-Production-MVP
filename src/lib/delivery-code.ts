import { randomBytes, randomInt, timingSafeEqual } from "crypto";

export function newDeliveryCode(): string {
  return randomInt(0, 10000).toString().padStart(4, "0");
}

export function newTrackToken(): string {
  return randomBytes(24).toString("base64url");
}

export function codesMatch(stored: string, given: string): boolean {
  if (!/^\d{4}$/.test(stored) || !/^\d{4}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(given));
}
