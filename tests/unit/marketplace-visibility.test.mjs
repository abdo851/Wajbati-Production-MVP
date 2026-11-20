import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_SURFACE,
  isMarketplaceSurface,
  marketplaceVisibility,
} from "../../src/lib/marketplace-visibility.ts";

test("Phase 1 defaults to marketplace surface without disabling legacy capabilities", () => {
  assert.equal(MARKETPLACE_SURFACE, "marketplace");
  assert.equal(isMarketplaceSurface(), true);
  assert.equal(marketplaceVisibility.showCustomerDriverRecruitment, false);
  assert.equal(marketplaceVisibility.showCustomerDeliveryFleetMarketing, false);
  assert.equal(marketplaceVisibility.showCustomerMealOrderFlow, false);
  assert.equal(marketplaceVisibility.showAuthenticatedStaffDesks, true);
});
