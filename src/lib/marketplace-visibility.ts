/**
 * Phase 1 — Marketplace feature visibility (presentation layer only).
 *
 * This module controls what the primary customer-facing UI emphasizes.
 * It does NOT delete routes, APIs, tables, wallets, OTP, drivers, or orders.
 *
 * Recover legacy customer-facing driver recruitment / delivery-fleet marketing:
 * set `marketplaceConfig.surface` to `"legacy"`.
 *
 * Staff who already have chef/driver/admin sessions keep their desk links.
 *
 * ---------------------------------------------------------------------------
 * Approved product requirements for LATER phases (do not implement here):
 * - Independent dish listings (never force all dishes into one combined listing)
 * - Permanent storefronts + optional temporary offers
 * - Optional pricing: fixed | negotiable | contact-for-price
 * - Daily publishing optional, never mandatory
 * - Contextual seller engagement suggestions (non-spammy)
 * - Do not build notification engines, push, presence, escrow, or payments here
 * ---------------------------------------------------------------------------
 */

export type MarketplaceSurface = "marketplace" | "legacy";

/** Mutable config object so the surface union stays usable at compile time. */
export const marketplaceConfig: { surface: MarketplaceSurface } = {
  surface: "marketplace",
};

export const MARKETPLACE_SURFACE: MarketplaceSurface = marketplaceConfig.surface;

export const marketplaceVisibility = {
  get surface(): MarketplaceSurface {
    return marketplaceConfig.surface;
  },

  /** Customer join menu, welcome gate, /join cards — driver path. */
  get showCustomerDriverRecruitment(): boolean {
    return marketplaceConfig.surface === "legacy";
  },

  /**
   * Customer homepage/marketing that presents Righ as operating a delivery fleet
   * or COD platform handoff as the primary story.
   */
  get showCustomerDeliveryFleetMarketing(): boolean {
    return marketplaceConfig.surface === "legacy";
  },

  /**
   * Legacy meal checkout UI on the primary Marketplace surface.
   * Code, routes, and APIs remain; only the primary customer CTA is hidden when false.
   */
  get showCustomerMealOrderFlow(): boolean {
    return marketplaceConfig.surface === "legacy";
  },

  /** Logged-in drivers/chefs/admins still reach their desks from chrome. */
  get showAuthenticatedStaffDesks(): boolean {
    return true;
  },
};

export function isMarketplaceSurface(): boolean {
  return marketplaceConfig.surface === "marketplace";
}
