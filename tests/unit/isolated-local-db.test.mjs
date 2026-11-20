import assert from "node:assert/strict";
import test from "node:test";
import {
  describeDatabaseTarget,
  resolveIsolatedTestDatabaseUrl,
} from "../../scripts/lib/isolated-local-db.mjs";

test("describeDatabaseTarget classifies localhost as local", () => {
  const meta = describeDatabaseTarget("postgresql://righ_test:x@127.0.0.1:55432/righ_test");
  assert.equal(meta.hostKind, "local");
  assert.equal(meta.port, "55432");
  assert.equal(meta.database, "righ_test");
  assert.equal(meta.refMatchesPrimary, false);
});

test("describeDatabaseTarget classifies Supabase primary as supabase + primary ref", () => {
  const meta = describeDatabaseTarget(
    "postgresql://postgres.npgoovxofxoheghlqlky:x@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
  );
  assert.equal(meta.hostKind, "supabase");
  assert.equal(meta.refMatchesPrimary, true);
});

test("resolveIsolatedTestDatabaseUrl accepts safe localhost test URL via env", () => {
  const previous = process.env.RIGH_TEST_DATABASE_URL;
  process.env.RIGH_TEST_DATABASE_URL = "postgresql://righ_test:secret@127.0.0.1:55432/righ_test";
  try {
    const { meta } = resolveIsolatedTestDatabaseUrl();
    assert.equal(meta.hostKind, "local");
    assert.equal(meta.port, "55432");
    assert.equal(meta.database, "righ_test");
    assert.equal(meta.refMatchesPrimary, false);
  } finally {
    if (previous === undefined) delete process.env.RIGH_TEST_DATABASE_URL;
    else process.env.RIGH_TEST_DATABASE_URL = previous;
  }
});

test("resolveIsolatedTestDatabaseUrl rejects production/Supabase test URL", () => {
  const previous = process.env.RIGH_TEST_DATABASE_URL;
  process.env.RIGH_TEST_DATABASE_URL =
    "postgresql://postgres.npgoovxofxoheghlqlky:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";
  try {
    assert.throws(() => resolveIsolatedTestDatabaseUrl(), /LOCAL refused/);
  } finally {
    if (previous === undefined) delete process.env.RIGH_TEST_DATABASE_URL;
    else process.env.RIGH_TEST_DATABASE_URL = previous;
  }
});

test("resolveIsolatedTestDatabaseUrl rejects wrong local port", () => {
  const previous = process.env.RIGH_TEST_DATABASE_URL;
  process.env.RIGH_TEST_DATABASE_URL = "postgresql://righ_test:secret@127.0.0.1:5432/righ_test";
  try {
    assert.throws(() => resolveIsolatedTestDatabaseUrl(), /55432/);
  } finally {
    if (previous === undefined) delete process.env.RIGH_TEST_DATABASE_URL;
    else process.env.RIGH_TEST_DATABASE_URL = previous;
  }
});
