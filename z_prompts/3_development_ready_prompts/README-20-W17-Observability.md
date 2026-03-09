# WEEK 17 — Observability Stack

## Prometheus + Grafana + Loki + PII Scrubbing · Phase 3 · CCMP

> **Prerequisite:** Week 16 complete.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**

- `apps/api/src/middleware/metrics.ts` — 7 Prometheus metrics using `prom-client`: `ccmp_http_request_duration_seconds` (histogram), `ccmp_cases_created_total` (counter), `ccmp_sla_breaches_total` (counter), `ccmp_active_agents_gauge` (gauge), `ccmp_queue_depth_gauge` (gauge), `ccmp_bullmq_queue_length` (gauge), `ccmp_http_request_errors_total` (counter — incremented in global error handler for 5xx).
- `GET /metrics` endpoint returning Prometheus text format (no auth — scrape-only from internal network).
- Add Prometheus, Grafana, Loki, Promtail to `docker-compose.yml`.
- `config/grafana/provisioning/dashboards/dashboards.yml` pointing to JSON files.
- 4 Grafana dashboard JSON stubs in `config/grafana/dashboards/`.
- Updated `apps/api/src/lib/logger.ts` — PII scrubbing must cover email, 16-digit credit card, E.164 phone, SSN patterns.
  **Constraints:**
- `ccmp_http_request_errors_total`: increment in global Express error handler for ALL 5xx responses
- Grafana provisioning YAML must reference JSON files by absolute container path
- PII scrubber: test with known PII strings — no PII should appear in Loki

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add .; git commit -m "feat: w17 observability complete"
```

**Next:** `README-21-W18-DB-Optimization.md`
