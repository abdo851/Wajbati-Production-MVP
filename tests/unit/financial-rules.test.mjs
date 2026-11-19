import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OWNER_FINANCIAL_RULES_APPROVED,
  assertOwnerFinancialRulesApproved,
  cashMealTotalMad,
} from "../../src/lib/financial-rules.ts";
import { calculateOrderFees } from "../../src/lib/commission.ts";
import { StoreError } from "../../src/lib/errors.ts";

describe("financial freeze", () => {
  it("keeps owner financial rules frozen", () => {
    assert.equal(OWNER_FINANCIAL_RULES_APPROVED, false);
  });

  it("computes meal cash only", () => {
    assert.equal(cashMealTotalMad(40, 2), 80);
    assert.equal(cashMealTotalMad(-1, 2), 0);
  });

  it("blocks wallet commission calculation while frozen", () => {
    assert.throws(() => assertOwnerFinancialRulesApproved("test"), StoreError);
    assert.throws(() => calculateOrderFees(50, 2), StoreError);
  });
});
