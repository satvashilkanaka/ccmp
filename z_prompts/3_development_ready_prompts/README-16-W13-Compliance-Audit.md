# WEEK 13 — Compliance & Audit Module
## Immutable Logs + Signed PDF Export + CSAT + KB · Phase 3 · CCMP

> **Prerequisite:** Week 12 complete. QA module working.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- `apps/api/src/modules/audit/audit.service.ts` — `getAuditLogs()` with pagination, `getUserAccessHistory()`, `exportAuditTrail()` generating signed PDF using `pdfkit` + `crypto.createSign("SHA256")` with `AUDIT_EXPORT_PRIVATE_KEY` env var.
- `apps/api/src/modules/audit/audit.router.ts` — `GET /audit/logs`, `GET /audit/access-history/:userId`, `POST /audit/export`. Behind `requireRole([COMPLIANCE_OFFICER, ADMIN])`.
- `apps/api/src/middleware/auditSelf.ts` — logs its own access with infinite-loop guard: check `resourceType !== "audit_log"` before logging.
- `apps/api/src/modules/csat/survey.router.ts` — **public routes** (no auth): `GET /survey/:token` and `POST /survey/respond`. Verify CSAT JWT (HS256, 7-day TTL). Idempotent — reject duplicates with `{ alreadySubmitted: true }`.
- `apps/api/src/modules/kb/kb.router.ts` — `GET /kb/search`, `POST /kb/articles` (SUPERVISOR+), `PATCH /kb/articles/:id`, `GET /kb/articles/:id` (increment `viewCount`).
**Constraints:**
- PDF must include: generation timestamp, exporter ID, date range, record count, cryptographic signature
- Compliance officer routes are GET-only except `POST /audit/export` (output generation, not mutation)
- CSAT token: HS256 JWT with `{ caseId }` payload, signed with `CSAT_TOKEN_SECRET`, exp 7d
- KB `viewCount`: `prisma.kbArticle.update({ data: { viewCount: { increment: 1 } } })` — atomic

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w13 compliance audit complete"
```

**Next:** `README-17-W14-Reporting.md`
