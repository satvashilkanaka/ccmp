# WEEK 9 — Supervisor Dashboard
## Live Queues + Reassign + Escalate + SLA Override · Phase 2 · CCMP

> **Prerequisite:** Week 8 complete. Recordings stored and gated.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- `apps/api/src/modules/supervisor/supervisor.service.ts` — `getLiveQueueData()` (Promise.all for parallel DB+Redis), `reassignCase()` (notify both old and new agent), `forceEscalate()` (reuse `escalateSlaBreachCase()` from Week 6 — **NOT a stub**), `overrideSla()` (cancel both warning+breach jobs, schedule new ones, create AuditLog).
- `apps/api/src/modules/supervisor/supervisor.router.ts` — 5 routes: `GET /queues`, `POST /cases/:id/reassign`, `POST /cases/:id/escalate`, `POST /cases/:id/sla-override`, `GET /sla/heatmap`. All behind `requireRole([SUPERVISOR, OPERATIONS_MANAGER, ADMIN])`.
- Case aging BullMQ cron (every 4h): find `WAITING_ON_CUSTOMER` cases older than 24h → transition to `ESCALATED`. Actor: `"system"`.
- `apps/web/src/app/(supervisor)/dashboard/page.tsx` — live queue counts (Socket.IO + React Query), agent workload table, SLA heatmap grid.
**Constraints:**
- `reassignCase`: notify BOTH old agent (`case:removed`) and new agent (`case:assigned`) via Redis publish
- All supervisor actions must: create CaseEvent with actorId, publish Redis event, create AuditLog row
- Case aging cron: use `system` as actorId, include `version` for optimistic lock compatibility
- `overrideSla`: cancel both `sla_warning:${caseId}` AND `sla_breach:${caseId}` jobs

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w9 supervisor complete"
```

**Next:** `README-13-W10-Chat-Search.md`
