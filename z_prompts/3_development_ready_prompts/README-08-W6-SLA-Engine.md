# WEEK 6 — SLA Engine
## BullMQ Delayed Jobs + Escalation Chain · Phase 2 · CCMP

> **Prerequisite:** Week 5 complete. Phase 1 handoff checklist passed.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 6. Phase 1 complete. Case assignment works. Build the SLA monitoring system. Every case assignment triggers a warning job (80% elapsed) and a breach job (100% elapsed) with delays calculated from the `SlaPolicy`. Breach must trigger an escalation chain.

---

## 📋 TASK

**Files to create:**

- `apps/api/src/modules/sla/sla.service.ts` — `attachSlaToCase()`, `scheduleWarning()`, `scheduleBreach()`, `cancelSlaJobs()`, `scheduleBreachAt()` (for SLA override). Use `jobId: \`sla_${type}:${caseId}\`` for idempotency.
- `workers/src/processors/sla.processor.ts` — `Worker` on `"sla"` queue, `concurrency: 20`. Handle `sla_warning` (publish Redis event, skip if RESOLVED/CLOSED). Handle `sla_breach` (trigger escalation chain, create audit log).
- Escalation chain: `ESCALATION_CHAIN = [SENIOR_AGENT, SUPERVISOR, OPERATIONS_MANAGER]`. If at ceiling, `notifyOperationsManager()`. Use `prisma.$transaction` for case update + event.
- `workers/src/index.ts` — instantiate all workers (sla, csat stub, maintenance stub). Add daily maintenance repeatable job.
- `GET /api/v1/sla/heatmap` — query all active cases, calculate pct remaining, return `SlaStatus` (OK / WARNING / BREACHED) per case.

**Wire into case assignment flow:** when routing engine publishes `case:assigned`, API subscribes and calls `attachSlaToCase()`.

---

## ⚙️ CONSTRAINTS

- BullMQ `jobId` must be unique per case — prevents duplicates if assign fires twice
- SLA processor must fetch **fresh case from DB** before acting — never trust stale job payload
- Guard: if `case.status` is `RESOLVED` or `CLOSED`, skip SLA action silently
- `cancelSlaJobs` must handle missing jobs gracefully (already completed = no error)
- All BullMQ workers: `removeOnComplete: { count: 100 }` and `removeOnFail: { count: 500 }`
- DLQ: failed jobs after 3 attempts → move to `sla-dlq` queue and log with `logger.error`
- Escalation chain: if `assignedToId` is null, skip directly to SUPERVISOR

---

## 📤 OUTPUT

1. `apps/api/src/modules/sla/sla.service.ts`
2. `workers/src/processors/sla.processor.ts`
3. `workers/src/index.ts` (all workers + cron schedules)
4. `GET /api/v1/sla/heatmap` endpoint

---

## ✅ VERIFICATION STEP

```bash
# Create case with 5-minute SLA. Set warningThreshold: 0.8.
# EXPECT at t=4min: Redis channel sla:warning receives message
# EXPECT at t=5min: case.status becomes ESCALATED in DB
# EXPECT if case resolved at t=3min: BullMQ jobs are cancelled

# Test heatmap
curl -s http://localhost:4000/api/v1/sla/heatmap \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" | jq .
# EXPECT: array of { caseId, slaStatus, pctRemaining }

git add . && git commit -m "feat: week-6 sla engine complete"
```

**Next:** `README-09-W7a-FreeSWITCH-ESL.md`
