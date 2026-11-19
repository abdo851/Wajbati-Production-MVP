# Integration tests blocked (Phase 2)

These scenarios require an explicitly isolated PostgreSQL test database and must not run against Neon/shared targets:

1. Concurrent `placeOrder` meal quantity reservation
2. Two drivers racing `acceptDelivery`
3. Duplicate/retry idempotency for place/accept/deliver
4. OTP valid / invalid / expired / exhausted against real Order rows
5. Successful delivery without wallet settlement rows
6. Refusal / not_reachable persistence + OrderStatusEvent history
7. Admin resolve + AuditLog rows
8. Distributed `checkRateLimitAsync` against `RateLimitBucket`

Gate (when an isolated DB exists):

- `E2E_ALLOW_DB_WRITES=1`
- `E2E_DATABASE_MODE=isolated`
- `CUSTOM_DATABASE_URL` host is localhost/127.0.0.1 only
- Apply `prisma/migrations` on that isolated DB only
- Never infer isolation from “app runs on localhost” alone
