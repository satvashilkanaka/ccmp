# WEEK 27 — Go-Live Preparation

## Readiness Checklist + Alerts + On-Call Runbook + Rollback Plan · Phase 5 · CCMP

> **Prerequisite:** Week 26 complete. UAT sign-off obtained from operations lead (written).
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **`apps/api/src/docs/swagger.ts`** — OpenAPI setup:

```typescript
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Application } from "express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CCMP API",
      version: "1.0.0",
      description: "Contact Centre Management Platform",
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/modules/**/*.router.ts"],
};

export function setupDocs(app: Application) {
  const spec = swaggerJsdoc(options);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
  app.get("/api/docs.json", (_req, res) => res.json(spec));
}
```

Call `setupDocs(app)` in `buildApp()`.

2. **Grafana alerts** in `config/grafana/alerts/production.yml` — configure alert rules for:

   - `ccmp_http_request_errors_total > 10` (5min window) → PagerDuty
   - `ccmp_sla_breaches_total` rate > 5/min → Slack
   - `ccmp_active_agents_gauge == 0` → PagerDuty critical
   - Postgres connection pool > 80% → Slack warning
   - Disk usage > 80% → Slack warning

3. **`docs/oncall-runbook.md`** — on-call runbook including:

   - Contact tree (engineer escalation chain)
   - 6 common incident playbooks: API down, FreeSWITCH unreachable, SLA jobs not firing, disk space, high memory, DB connection exhaustion
   - Each playbook: symptoms, diagnosis commands, remediation steps, escalation criteria

4. **`scripts/rollback.sh`** — rollback procedure:

   - Stop current containers
   - Pull previous image tag
   - Restore DB from last backup if schema changed
   - Verify health after rollback

5. **Rollback rehearsal** — run the rollback procedure on staging before go-live. Document time taken.

---

## ⚙️ CONSTRAINTS

- Swagger UI available at `/api/docs` — accessible without auth (internal network only)
- All 5 alerts must be test-triggered before go-live (not just configured)
- On-call runbook distributed to ALL engineers — confirmed received
- Rollback must be < 15 minutes — time and document the rehearsal

---

## ✅ VERIFICATION STEP

```bash
# 1. OpenAPI docs
curl -s http://localhost:4000/api/docs.json | jq .info
# EXPECT: {"title":"CCMP API","version":"1.0.0"}

# 2. Test trigger each alert (use Grafana UI)
# Temporarily set threshold to 1 to trigger immediately
# EXPECT: Notifications received in Slack/PagerDuty

# 3. Verify runbook distributed
# Get confirmation emails from all engineers

# 4. Run rollback rehearsal on staging
time ./scripts/rollback.sh
# EXPECT: < 15 minutes

git add .; git commit -m "feat: week-27 go-live prep complete"
```

**Next:** `README-31-W28-GoLive.md`
