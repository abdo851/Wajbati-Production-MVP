import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAndBumpDataRevision,
  bumpDataRevision,
  ensureDataRevisionTable,
  readDataRevision,
} from "../../src/lib/db/data-revision.ts";
import { StoreError } from "../../src/lib/errors.ts";

describe("data revision helpers (in-memory contract)", () => {
  it("exports revision helpers", () => {
    assert.equal(typeof ensureDataRevisionTable, "function");
    assert.equal(typeof readDataRevision, "function");
    assert.equal(typeof bumpDataRevision, "function");
    assert.equal(typeof assertAndBumpDataRevision, "function");
  });

  it("StoreError remains the stale-graph signal", () => {
    const err = new StoreError("stale", 409);
    assert.equal(err.status, 409);
    assert.equal(err.name, "StoreError");
  });
});
