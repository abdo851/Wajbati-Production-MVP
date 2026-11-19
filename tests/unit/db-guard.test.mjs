import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseLooksSharedOrProduction } from "../../src/lib/super-admin.ts";
import {
  assertDatabaseWriteAllowed,
  isApprovedLocalSupabasePostgresTarget,
  isTrustedDeploymentContext,
} from "../../src/lib/db-guard.ts";

const APPROVED_REF = "abcdefghijklmnopqrst";
const OTHER_REF = "zyxwvutsrqponmlkjihg";

const FAKE = {
  approvedDirect: `postgresql://postgres:fake-password@db.${APPROVED_REF}.supabase.co:5432/postgres`,
  approvedPooler: `postgresql://postgres.${APPROVED_REF}:fake-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  otherDirect: `postgresql://postgres:fake-password@db.${OTHER_REF}.supabase.co:5432/postgres`,
  otherPooler: `postgresql://postgres.${OTHER_REF}:fake-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  neon: "postgresql://u:p@ep-icy-meadow-b9gw03xl-pooler.eu-central-1.aws.neon.tech/neondb",
  unknown: "postgresql://u:p@db.example.com:5432/app",
  localhost: "postgresql://u:p@localhost:5432/wajbati_test",
  malformed: "not-a-valid-url",
};

/** Snapshot/restore only the env keys this suite touches — never prints values. */
function withEnv(overrides, fn) {
  const keys = [
    "CUSTOM_DATABASE_URL",
    "DATABASE_URL",
    "RIGH_APPROVED_SUPABASE_PROJECT_REF",
    "RIGH_ALLOW_SHARED_DB_WRITES",
    "VERCEL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        const value = overrides[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    return fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function assertRejected(fn) {
  assert.throws(fn, (error) => error?.name === "StoreError" && error.status === 503);
}

describe("database host classification", () => {
  it("treats empty URL as shared/unidentifiable (fail closed)", () => {
    withEnv({ CUSTOM_DATABASE_URL: undefined, DATABASE_URL: undefined }, () => {
      assert.equal(databaseLooksSharedOrProduction(), true);
    });
  });

  it("treats localhost as non-shared", () => {
    withEnv({ CUSTOM_DATABASE_URL: FAKE.localhost, DATABASE_URL: undefined }, () => {
      assert.equal(databaseLooksSharedOrProduction(), false);
    });
  });

  it("treats neon hosts as shared", () => {
    withEnv({ CUSTOM_DATABASE_URL: FAKE.neon }, () => {
      assert.equal(databaseLooksSharedOrProduction(), true);
    });
  });

  it("still classifies approved Supabase as shared (allowlist is guard-only)", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.approvedDirect,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
      },
      () => {
        assert.equal(databaseLooksSharedOrProduction(), true);
        assert.equal(isApprovedLocalSupabasePostgresTarget(), true);
      },
    );
  });
});

describe("RIGH_APPROVED_SUPABASE_PROJECT_REF allowlist", () => {
  it("allows approved Supabase direct connection locally", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.approvedDirect,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isTrustedDeploymentContext(), false);
        assert.doesNotThrow(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("allows approved Supabase session pooler locally", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.approvedPooler,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.doesNotThrow(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects a different Supabase project", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.otherDirect,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isApprovedLocalSupabasePostgresTarget(), false);
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects wrong project reference against approved URL", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.approvedDirect,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: OTHER_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects Neon connection", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.neon,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isApprovedLocalSupabasePostgresTarget(), false);
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects unknown PostgreSQL host", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.unknown,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects missing CUSTOM_DATABASE_URL", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: undefined,
        DATABASE_URL: undefined,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isApprovedLocalSupabasePostgresTarget(), false);
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects malformed CUSTOM_DATABASE_URL", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.malformed,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isApprovedLocalSupabasePostgresTarget(), false);
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects when approved project reference is missing", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.approvedDirect,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: undefined,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isApprovedLocalSupabasePostgresTarget(), false);
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("rejects pooler URL when username lacks project ref", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL:
          "postgresql://postgres:fake-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.equal(isApprovedLocalSupabasePostgresTarget(), false);
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("NODE_ENV alone cannot authorize shared-database writes", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.neon,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: undefined,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        const previousNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
          assertRejected(() => assertDatabaseWriteAllowed("prisma"));
        } finally {
          if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
          else process.env.NODE_ENV = previousNodeEnv;
        }
      },
    );
  });

  it("keeps localhost allowed without allowlist", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.localhost,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: undefined,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.doesNotThrow(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("keeps trusted deployment behavior unchanged", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.neon,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: undefined,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: "1",
      },
      () => {
        assert.equal(isTrustedDeploymentContext(), true);
        assert.doesNotThrow(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("keeps broad shared-database bypass unchanged and not enabled by default", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.neon,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: undefined,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assert.notEqual(process.env.RIGH_ALLOW_SHARED_DB_WRITES, "1");
        assertRejected(() => assertDatabaseWriteAllowed("prisma"));
      },
    );

    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.neon,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: undefined,
        RIGH_ALLOW_SHARED_DB_WRITES: "1",
        VERCEL: undefined,
      },
      () => {
        assert.doesNotThrow(() => assertDatabaseWriteAllowed("prisma"));
      },
    );
  });

  it("does not authorize supabase surface via Postgres allowlist", () => {
    withEnv(
      {
        CUSTOM_DATABASE_URL: FAKE.approvedDirect,
        NEXT_PUBLIC_SUPABASE_URL: `https://${APPROVED_REF}.supabase.co`,
        RIGH_APPROVED_SUPABASE_PROJECT_REF: APPROVED_REF,
        RIGH_ALLOW_SHARED_DB_WRITES: undefined,
        VERCEL: undefined,
      },
      () => {
        assertRejected(() => assertDatabaseWriteAllowed("supabase"));
      },
    );
  });
});
