# WEEK 20 — k6 Load Testing Suite

## All Performance Targets Must Pass · Phase 4 · CCMP

> **Prerequisite:** Week 19 complete. Run tests against STAGING — never against production.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

Create 5 k6 load test scenarios. **Every test must produce a passing result file committed to `load-tests/results/`.**

### 1. `load-tests/scenarios/case-list.js`

- Ramping VUs: 0→500 over 2min, sustained 2min, down 30s
- Threshold: `http_req_duration{endpoint:case_list}: p(95)<150` — `abortOnFail: true`
- Auth: generate 500 tokens in `setup()` using `SharedArray`, distribute via VU index

### 2. `load-tests/scenarios/case-create.js`

- Constant arrival rate: 200 req/s, 2 min duration
- Threshold: `http_req_duration: p(95)<200`, `http_req_failed: rate<0.001`

### 3. `load-tests/scenarios/routing-engine.js`

- Constant arrival rate: 1000 req/min on routing-service `/route` endpoint
- Threshold: `http_req_duration: p(95)<50`

### 4. `load-tests/scenarios/websocket.js`

- 500 constant VUs, 3 min
- Each VU: connect Socket.IO, emit `agent:join`, listen for events
- Use `k6/experimental/websockets` (not legacy `k6/ws`)
- Threshold: `ws_connecting: p(95)<500`

### 5. `load-tests/scenarios/sla-burst.js`

- Rapidly create 10,000 cases
- After 10 minutes: verify DLQ depth = 0
- Threshold: `http_req_failed: rate<0.001`

### After each passing test:

```bash
k6 run load-tests/scenarios/<name>.js --out json=load-tests/results/<name>-$(date +%Y%m%d).json
```

---

## ⚙️ CONSTRAINTS

- Every script must use `thresholds` with `abortOnFail: true` — exits non-zero on failure
- Auth tokens generated in `setup()` with `SharedArray` — never inside VU loop
- Result JSON files must be committed to git as performance regression baseline
- Run all tests against staging environment URL

---

## ✅ VERIFICATION STEP

```bash
# Run all 5 scenarios
k6 run load-tests/scenarios/case-list.js
# EXPECT: ✓ http_req_duration{endpoint:case_list}: p(95)<150ms — passed

k6 run load-tests/scenarios/sla-burst.js
# After 10 min, check DLQ:
docker exec ccmp-redis redis-cli -a $REDIS_PASSWORD LLEN ccmp:bullmq:sla:dead
# EXPECT: 0

# Commit results
ls load-tests/results/
# EXPECT: 5 JSON files

git add load-tests/results/; git commit -m "perf: k6 baseline results week-20"
```

**Next:** `README-24-W21-Frontend-Perf.md`
