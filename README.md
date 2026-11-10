# Wajbati

Daily home-cooked meals. Customers order from the board, chefs publish from the kitchen, and the admin desk reviews kitchens, drivers, and wallets.

## Local

```powershell
npm install
npm run dev
```

Open http://localhost:3000. With no `DATA_PROVIDER`, orders stay in `data/store.json` on this machine. That folder is gitignored.

## Vercel

1. Import this repository in Vercel.
2. Build command: `npm run build`. Output: Next.js default.
3. Leave `DATA_PROVIDER` unset for a preview that does not need a database. The serverless disk does not keep `data/store.json` between requests.
4. For a shared database later, set `DATA_PROVIDER=supabase` plus the project URL and anon key from `.env.example`, then restart the deployment.

Do not commit `.env`, `node_modules`, `.next`, or `data/`.
