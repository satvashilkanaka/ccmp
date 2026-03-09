# WEEK 14 — Reporting & Analytics
## Read-Replica Queries + CSV Streaming + Recharts Dashboard · Phase 3 · CCMP

> **Prerequisite:** Week 13 complete. Compliance module working.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- `apps/api/src/modules/reports/reports.service.ts` — 7 SQL queries using `prismaRead`: agent performance, SLA breach rate, case volume by channel, case volume by priority, resolution time distribution, CSAT scores over time, queue backlog history. All queries use `/* read-replica */` comment.
- `apps/api/src/modules/reports/reports.router.ts` — `GET /reports/:type` and `GET /reports/export?type=&format=csv`. CSV export uses `csv-stringify` piped to `res`.
- `apps/web/src/app/(supervisor)/reports/page.tsx` — Recharts dashboard with all 7 charts (LineChart, BarChart, PieChart).
**Constraints:**
- All report queries use `prismaRead` — **never `prismaWrite`**
- CSV streaming: `for-await-of` cursor → `csvStream.write()` → `csvStream.pipe(res)` — never buffer full dataset in memory
- Meilisearch operations all wrapped in try/catch
- `docker stats api` memory must stay flat during large CSV export

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w14 reporting complete"
```

**Next:** `README-18-W15-CSAT.md`
