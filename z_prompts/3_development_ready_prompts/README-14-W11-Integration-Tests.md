# WEEK 11 — Integration Testing & Phase 2 Hardening
## No new features — testing only · Phase 2 · CCMP

> **Prerequisite:** Week 10 complete. All Phase 2 features built.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**This week: write tests, fix bugs, do NOT add features.**

**Files to create:**
- `vitest.config.ts` (root + per-package with coverage thresholds)
- `workers/src/__tests__/sla.processor.test.ts` — test: (a) warning cancels on case resolve, (b) breach skips CLOSED case, (c) SLA override reschedules, (d) missing SLA policy throws (not silently fails)
- `apps/api/src/__tests__/cases.service.test.ts` — test: all 22 valid transitions, stale version → 409, concurrent updates with `Promise.all` → second throws ConflictError
- `apps/api/src/__tests__/recordings.service.test.ts` — test: AGENT → 403, every playback creates AuditLog, presigned URL has `expiresIn: 900`
- `load-tests/scenarios/smoke.js` — k6 smoke test: case list p95 < 150ms at 100 VUs, error rate < 0.001
**Constraints:**
- Vitest fake timers for all SLA time-based tests — never `await sleep()`
- Separate test database: `ccmp_test` — truncate between suites
- Mock MinIO and Redis in unit tests
- Coverage threshold: **80%** statements on all service files

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w11 integration tests complete"
```

**Next:** `README-15-W12-QA-Module.md`
