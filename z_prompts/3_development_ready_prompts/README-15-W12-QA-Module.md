# WEEK 12 — QA Review Module
## Scoring + Compliance Flags + Agent Notifications · Phase 3 · CCMP

> **Prerequisite:** Week 11 complete. Phase 2 integration tests pass.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- `packages/shared/src/types/qa.ts` — `ComplianceFlag` enum: `PCI_DTMF_PAUSE_NOT_USED`, `AGENT_ID_NOT_VERIFIED`, `SENSITIVE_DATA_SPOKEN`, `CALL_ABRUPTLY_ENDED`, `SLA_MISREPRESENTED`. Rubric types.
- `apps/api/src/modules/qa/qa.service.ts` — `getQaQueue()` with review lock (Redis TTL 30min), `createQaReview()` with `calculateWeightedScore()`, `notifyComplianceOfficer()`.
- `apps/api/src/modules/qa/qa.router.ts` — `GET /qa/queue`, `POST /qa/reviews`, `GET /qa/reviews/:caseId`. Behind `requireRole([QA_ANALYST, ADMIN])`.
- `apps/web/src/app/(qa)/review/[caseId]/page.tsx` — HTML5 audio player, rubric score sliders, compliance flag checkboxes, coaching notes textarea, submit with optimistic UI.
**Constraints:**
- `calculateWeightedScore`: validate weights sum to 100 — throw `BadRequestError` if not
- Each item score must be ≤ its `maxScore` — Zod schema enforces this
- Every `createQaReview` must create AuditLog row `action: "created", resourceType: "qa_review"`
- QA queue review lock: Redis key `qa:lock:${caseId}` with 30-min TTL — prevents double-review

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w12 qa module complete"
```

**Next:** `README-16-W13-Compliance-Audit.md`
