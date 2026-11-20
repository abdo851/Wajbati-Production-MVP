# Phase 5A audit screenshots (local only)

Captured against isolated local Next (`hostKind=local`). No production access.

| File | Page | Notes |
|------|------|--------|
| `01-terms.png` | `/terms` | Legal terms (legacy COD/driver wording visible) |
| `02-privacy.png` | `/privacy` | Privacy + CNDP placeholder |
| `03-admin-login.png` | `/admin` | Admin login gate only (no authenticated desk screenshots) |
| `04-join-or-home.png` | `/join` capture attempt | Browser capture of join flow / related chrome |

Authenticated admin section screenshots were **not** captured in this audit pass to avoid putting isolated credentials through interactive fill tooling/logs. Admin section inventory is from code review of `src/components/admin-dashboard.tsx` and `/api/admin/*`.
