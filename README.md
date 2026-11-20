# Wajbati / Righ

Daily home-cooked meals marketplace. Customers browse kitchens and listings, chefs publish from the kitchen desk, and the admin desk reviews kitchens, drivers, wallets, and Marketplace moderation.

## Local development (isolated database — required)

Ordinary local work **must not** use the production Supabase/primary database.

1. Start the isolated Postgres container (`righ-pg-test` on `127.0.0.1:55432` / `righ_test`).
2. Keep the connection string only in gitignored `.env.test.local` as `RIGH_TEST_DATABASE_URL`.
3. Start the app with:

```powershell
npm install
npm run dev
```

`npm run dev` (alias `npm run dev:local`) validates the isolated target, rejects production/Supabase/Neon hosts, forces the process onto `righ_test`, and then starts Next.js. It does **not** rewrite `.env.local` on disk.

Useful checks:

```powershell
npm run db:isolated:check
npm run db:migrate:isolated
```

Open http://127.0.0.1:3000. Confirm `/api/health` reports `hostKind: "local"` and `refMatchesPrimary: false`.

`npm run dev:next` starts Next without the isolated guard — do not use it for ordinary work.

## Vercel / production

Production stays configured in the deployment environment (`CUSTOM_DATABASE_URL`, secrets, etc.). Do not copy production credentials or password hashes into the local test database.

1. Import this repository in Vercel.
2. Build command: `npm run build`.
3. Set production env vars in the Vercel project — never commit `.env.local`.

Do not commit `.env*`, `node_modules`, `.next`, or `data/`.
