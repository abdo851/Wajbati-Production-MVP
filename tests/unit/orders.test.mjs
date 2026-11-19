import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertTransition,
  formatClosureReason,
  isPostPreparationCancel,
  isPrePreparationCancel,
  isTerminalOrderStatus,
  parseClosureParty,
} from "../../src/lib/orders.ts";
import { StoreError } from "../../src/lib/errors.ts";

describe("order transitions", () => {
  it("allows pending -> confirmed and pending -> cancelled", () => {
    assert.doesNotThrow(() => assertTransition("pending", "confirmed"));
    assert.doesNotThrow(() => assertTransition("pending", "cancelled"));
  });

  it("allows confirmed -> assigned for driver accept", () => {
    assert.doesNotThrow(() => assertTransition("confirmed", "assigned"));
  });

  it("rejects delivered after refused", () => {
    assert.throws(() => assertTransition("refused", "delivered"), StoreError);
  });

  it("treats same-status as no-op and blocks other terminal moves", () => {
    assert.doesNotThrow(() => assertTransition("cancelled", "cancelled"));
    assert.throws(() => assertTransition("cancelled", "delivered"), StoreError);
    assert.throws(() => assertTransition("refused", "picked_up"), StoreError);
  });

  it("classifies cancel timing", () => {
    assert.equal(isPrePreparationCancel("pending", "cancelled"), true);
    assert.equal(isPostPreparationCancel("confirmed", "cancelled"), true);
    assert.equal(isTerminalOrderStatus("delivered"), true);
  });

  it("encodes responsible party in closure reason", () => {
    const reason = formatClosureReason("customer", "refused meal");
    assert.equal(parseClosureParty(reason), "customer");
    assert.match(reason, /refused meal/);
  });
});
