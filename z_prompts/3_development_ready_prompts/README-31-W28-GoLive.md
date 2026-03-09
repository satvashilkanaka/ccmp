# WEEK 28 — Go-Live & Hypercare
## Canary Rollout + 7-Day Monitoring · Phase 5 · CCMP

> **Prerequisite:** Week 27 complete. All 45 items on the Master Go-Live Checklist are checked.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **`scripts/canary-expand.sh`** — health-gate script for canary expansion:
```bash
#!/bin/bash
# canary-expand.sh — checks health before expanding canary
# Usage: ./canary-expand.sh <api-url> <expansion-label>
set -euo pipefail

API_URL="${1:-http://localhost:4000}"
LABEL="${2:-canary-expansion}"
WINDOW_MINUTES=30
MAX_ERROR_RATE=0.01   # 1%
MAX_P95_MS=200

echo "🔍 Checking canary health before $LABEL..."

# Check error rate (Prometheus query)
ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=rate(ccmp_http_request_errors_total[${WINDOW_MINUTES}m])/rate(http_requests_total[${WINDOW_MINUTES}m])" \
  | jq -r '.data.result[0].value[1] // "0"')

# Check p95 latency
P95=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,rate(ccmp_http_request_duration_seconds_bucket[${WINDOW_MINUTES}m]))*1000" \
  | jq -r '.data.result[0].value[1] // "0"')

echo "Error rate: $ERROR_RATE (max: $MAX_ERROR_RATE)"
echo "p95 latency: ${P95}ms (max: ${MAX_P95_MS}ms)"

if (( $(echo "$ERROR_RATE > $MAX_ERROR_RATE" | bc -l) )); then
  echo "❌ Error rate too high — aborting expansion"
  exit 1
fi

if (( $(echo "$P95 > $MAX_P95_MS" | bc -l) )); then
  echo "❌ p95 latency too high — aborting expansion"
  exit 1
fi

echo "✅ Health gates passed — proceeding with $LABEL"
```

2. **Go-live sequence** (execute in order):
   - T-24h: Final production backup. Confirm all team on standby.
   - T-2h: Deploy to production in maintenance mode. Run migrations. Verify DB.
   - T-0: Enable Team A (5 agents). Monitor 2h. Run `./scripts/canary-expand.sh ... "team-a-stable"`.
   - T+2h: If gates pass → expand to Teams A+B (20 agents). Monitor 2h.
   - T+4h: If gates pass → full rollout. All agents.
   - T+6h: Remove maintenance mode. Announce go-live.

3. **Hypercare monitoring** — monitor these dashboards for 7 days:
   - SLA compliance rate (target: > 90%)
   - API error rate (target: < 0.1%)
   - System uptime (target: > 99.5%)
   - Queue backlog depth
   - Active agent count

4. **Day 7 metrics review** — document in `docs/post-launch/day-7-metrics.md`:
   - Actual vs target for all 5 metrics above
   - Top 3 issues encountered
   - Backlog items for Sprint 2
   - ADR-005 final sign-off

5. **ADR documentation** — write and commit all 5 ADRs in `docs/adr/`:
   - `001-technology-stack.md`
   - `002-telephony-integration.md`
   - `003-reporting-architecture.md`
   - `004-horizontal-scaling-strategy.md`
   - `005-security-compliance-approach.md`

---

## ⚙️ CONSTRAINTS

- Canary health gate: error rate < 1% AND p95 < 200ms for **30 minutes** before each expansion
- Never skip canary stages — always wait the full monitoring window
- If any health gate fails: halt expansion, investigate, fix, restart monitoring window
- Day 7 sign-off: written document from operations lead confirming hypercare end

---

## ✅ VERIFICATION STEP

```bash
# 1. Test canary gate with simulated high error rate
PROMETHEUS_URL=http://localhost:9090 ./scripts/canary-expand.sh http://localhost:4000 "test"
# EXPECT: Either ✅ passes or ❌ blocks based on actual metrics

# 2. Day 7 health check
curl -s http://localhost:4000/api/v1/admin/system-health \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
# EXPECT: All services "healthy"

# 3. Final ADR check
ls docs/adr/
# EXPECT: 5 files

# 4. Production .env not in git
git log --all -- .env | wc -l
# EXPECT: 0

# 🎉 CCMP is LIVE
echo "✅ CCMP Go-Live Complete — 28-week implementation finished!"
git add . && git commit -m "feat: week-28 go-live complete 🎉"
git tag v1.0.0 && git push origin main --tags
```

---

## 🏁 Post Go-Live Checklist

- [ ] SLA compliance > 90% on Day 7 report
- [ ] Zero P0 incidents in first 7 days
- [ ] All 5 ADRs committed to `docs/adr/`
- [ ] `docs/post-launch/day-7-metrics.md` written and shared
- [ ] Hypercare officially ended (written ops lead sign-off)
- [ ] Sprint 2 backlog created from UAT P2/P3 issues
- [ ] Production `.env` NOT in git (`git log --all -- .env` returns 0)

**🎉 You have completed the CCMP 28-week implementation!**
