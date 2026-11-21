import assert from "node:assert/strict";
import test from "node:test";
import {
  REPORT_CATEGORIES,
  assertCaseTransition,
  assertDecisionReason,
  isReportCategory,
  restoreTargetStatus,
} from "../../src/lib/marketplace/case-rules.ts";

test("D5 categories are exactly the approved set", () => {
  assert.deepEqual([...REPORT_CATEGORIES], [
    "spam",
    "fraud",
    "inappropriate",
    "misleading",
    "other",
    "general",
  ]);
  assert.equal(isReportCategory("spam"), true);
  assert.equal(isReportCategory("scam"), false);
});

test("case transitions reject illegal moves", () => {
  assert.doesNotThrow(() => assertCaseTransition("open", "under_review"));
  assert.throws(() => assertCaseTransition("open", "resolved"), /Invalid case transition/);
  assert.doesNotThrow(() => assertCaseTransition("resolved", "reopened"));
  assert.throws(() => assertCaseTransition("dismissed", "under_review"), /Invalid case transition/);
});

test("decision reason requires documentation", () => {
  assert.throws(() => assertDecisionReason("short"), /10 characters/);
  assert.equal(assertDecisionReason("Documented restore after seller fix."), "Documented restore after seller fix.");
});

test("D2 restore target uses previouslyApprovedAt history", () => {
  assert.equal(restoreTargetStatus(null), "pending");
  assert.equal(restoreTargetStatus(undefined), "pending");
  assert.equal(restoreTargetStatus("2026-01-01T00:00:00.000Z"), "approved");
  assert.equal(restoreTargetStatus(new Date("2026-01-01")), "approved");
});
