# WEEK 15 — CSAT Survey System
## Automated Trigger + Email Delivery · Phase 3 · CCMP

> **Prerequisite:** Week 14 complete.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- `workers/src/processors/csat.processor.ts` — BullMQ job triggered 15 minutes after case transitions to `CLOSED`. Generate CSAT JWT token (HS256, 7-day expiry). Send email via Nodemailer with survey link. Create `CsatResponse` row with `expiresAt`.
- Wire CSAT trigger: in `transitionStatus()`, when `newStatus === "CLOSED"`, add a BullMQ job with 900s (15 min) delay to the `csat` queue.
- Run migration: `pnpm prisma migrate dev --name add_csat_kb` (adds `CsatResponse` and `KbArticle` tables if not yet migrated from Week 2a schema).
**Constraints:**
- CSAT job must have `delay: 900_000` ms (15 minutes)
- Survey link: `${process.env.NEXT_PUBLIC_API_URL}/survey/${token}`
- `CsatResponse`: one per case (`caseId` is `@unique`) — enforce at DB level

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w15 csat complete"
```

**Next:** `README-19-W16-Knowledge-Base.md`
