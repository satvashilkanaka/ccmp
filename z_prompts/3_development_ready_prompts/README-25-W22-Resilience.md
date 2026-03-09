# WEEK 22 — Circuit Breakers, Graceful Shutdown & Failure Testing

## Resilience Engineering · Phase 4 · CCMP

> **Prerequisite:** Week 21 complete. Bundle size < 200kB.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **`apps/api/src/lib/circuit-breaker.ts`** — create 3 circuit breakers using `opossum`:

```typescript
import CircuitBreaker from "opossum";
const options = {
  errorThresholdPercentage: 50,
  timeout: 3000,
  resetTimeout: 30_000,
};
export const eslBreaker = new CircuitBreaker(
  async (fn: Function) => fn(),
  options
);
export const emailBreaker = new CircuitBreaker(
  async (fn: Function) => fn(),
  options
);
export const minioBreaker = new CircuitBreaker(
  async (fn: Function) => fn(),
  options
);
```

2. **Wire into global error handler** in `apps/api/src/app.ts`:

```typescript
// Already has placeholder from Week 2b — fill in:
if (err.constructor?.name === "OpenCircuitError") {
  res
    .status(503)
    .json({ error: "Service temporarily unavailable — circuit open" });
  return;
}
```

3. **Fix graceful shutdown** in `apps/api/src/index.ts` — the `httpServer` must be exported from `buildApp()` and used in shutdown handler. Current pattern from Week 2b should already be correct — verify `httpServer.close(callback)` is called, not `app.close()`.

4. **`scripts/backup.sh`** — `pg_dump` with GPG encryption, upload to MinIO offsite bucket.

5. **`scripts/restore.sh`** — download from MinIO, GPG decrypt, `pg_restore`.

6. **Failure scenario testing** — test all 8 scenarios from the failure matrix and document results in `docs/failure-scenarios.md`:
   - DB connection loss, Redis loss, MinIO down, FreeSWITCH unreachable
   - High memory, disk full, API pod crash, network partition

---

## ⚙️ CONSTRAINTS

- `httpServer.close(callback)` — callback fires after all connections drain
- Register both `SIGTERM` and `SIGINT` handlers
- Circuit breaker open state → HTTP 503 with `{ error: "Service temporarily unavailable — circuit open" }`
- Backup: GPG-encrypt `pg_dump` before uploading — never store plaintext backups

---

## ✅ VERIFICATION STEP

```bash
# Circuit breaker test
docker compose stop minio
curl -s -X POST http://localhost:4000/api/v1/cases/<id>/upload \
  -H "Authorization: Bearer $TOKEN" | jq .
# EXPECT: {"error":"Service temporarily unavailable — circuit open"}

# Graceful shutdown test
# Start API, send 10 requests, immediately SIGTERM:
kill -SIGTERM <api-pid>
# EXPECT: All 10 in-flight requests complete before process exits

# Backup/restore test
./scripts/backup.sh && ./scripts/restore.sh ccmp_restore
# Verify row counts match

git add .; git commit -m "feat: week-22 resilience complete"
echo "🎉 Phase 4 Complete!"
```

**🎉 Phase 4 Complete! Next:** `README-26-W23-Security.md`
