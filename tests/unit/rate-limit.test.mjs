import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRateLimit, checkRateLimitAsync, clientKey } from "../../src/lib/rate-limit.ts";

describe("process-local rate limit", () => {
  it("allows up to max then blocks within the window", () => {
    const key = `unit-${Date.now()}-${Math.random()}`;
    assert.equal(checkRateLimit(key, 3, 60_000), true);
    assert.equal(checkRateLimit(key, 3, 60_000), true);
    assert.equal(checkRateLimit(key, 3, 60_000), true);
    assert.equal(checkRateLimit(key, 3, 60_000), false);
  });

  it("derives client key without revealing account existence", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    assert.equal(clientKey(request), "203.0.113.10");
  });

  it("fail-closed mode denies when shared DB writes are blocked", async () => {
    const previous = {
      CUSTOM_DATABASE_URL: process.env.CUSTOM_DATABASE_URL,
      RIGH_APPROVED_SUPABASE_PROJECT_REF: process.env.RIGH_APPROVED_SUPABASE_PROJECT_REF,
      RIGH_ALLOW_SHARED_DB_WRITES: process.env.RIGH_ALLOW_SHARED_DB_WRITES,
      VERCEL: process.env.VERCEL,
    };
    try {
      process.env.CUSTOM_DATABASE_URL =
        "postgresql://postgres.otherref:fake@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";
      process.env.RIGH_APPROVED_SUPABASE_PROJECT_REF = "npgoovxofxoheghlqlky";
      delete process.env.RIGH_ALLOW_SHARED_DB_WRITES;
      delete process.env.VERCEL;
      const allowed = await checkRateLimitAsync(`fail-closed-${Date.now()}`, 5, 60_000, "closed");
      assert.equal(allowed, false);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
