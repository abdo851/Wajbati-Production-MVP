import {
  applyIsolatedLocalDatabaseEnv,
  describeDatabaseTarget,
  loadEnvFile,
  resolveIsolatedTestDatabaseUrl,
} from "../../scripts/lib/isolated-local-db.mjs";

export { describeDatabaseTarget, loadEnvFile, resolveIsolatedTestDatabaseUrl };

/**
 * Fail closed: integration tests may only target the dedicated local Docker DB.
 * Never prints connection strings or passwords.
 */
export function assertIsolatedTestDatabase() {
  // Reuse the same local-dev gate, then return the identity shape tests expect.
  const meta = applyIsolatedLocalDatabaseEnv();
  return {
    host: meta.host,
    port: meta.port,
    database: meta.database,
    user: meta.user,
  };
}
