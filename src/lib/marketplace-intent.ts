/** Client-only return context for Marketplace actions after authentication. */

export type MarketplaceIntentAction = "contact_listing" | "contact_seller" | "follow_seller";

export type MarketplaceIntent = {
  action: MarketplaceIntentAction;
  sellerUserId: string;
  listingId?: string;
  chefProfileId?: string;
  title?: string;
  returnPath: string;
  createdAt: number;
};

const KEY = "righ_marketplace_intent";
const MAX_AGE_MS = 30 * 60 * 1000;

export function saveMarketplaceIntent(intent: Omit<MarketplaceIntent, "createdAt">) {
  if (typeof window === "undefined") return;
  const payload: MarketplaceIntent = { ...intent, createdAt: Date.now() };
  window.sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function peekMarketplaceIntent(): MarketplaceIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketplaceIntent;
    if (!parsed?.action || !parsed?.sellerUserId || !parsed?.returnPath) return null;
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumeMarketplaceIntent(): MarketplaceIntent | null {
  const intent = peekMarketplaceIntent();
  if (intent) window.sessionStorage.removeItem(KEY);
  return intent;
}

export function clearMarketplaceIntent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}

/** Only allow same-origin relative paths (no protocol-relative or absolute URLs). */
export function safeReturnPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate.includes("://")) return fallback;
  return candidate;
}
