# Phase 5 — Security, Admin & Production Go-Live
### CCMP Implementation Roadmap · Weeks 23–28

> **Goal:** Harden every surface of the platform against real-world threats, build the Admin module that puts operations teams in control, and execute a methodical production go-live. By the end of this phase, the CCMP is live, auditable, secure, and fully operated by non-engineering staff. This is the finish line.

---

## Overview

| Attribute | Value |
|---|---|
| **Duration** | 6 Weeks |
| **Team Focus** | Full team — DevOps leads security; Backend leads Admin API; Full-Stack leads Admin UI |
| **Primary Output** | Security-hardened platform, Admin module, production deployment, go-live |
| **Depends On** | Phase 4 complete; all performance targets proven |
| **Success Gate** | Zero critical OWASP vulnerabilities; Admin can create routing rules without code changes; platform live in production |

---

## Security Posture Goals

Before go-live, these security properties must be proven by evidence (test output, audit report, or configuration proof — not assertions):

| Property | Evidence Required |
|---|---|
| No critical CVEs in dependencies | `pnpm audit` output with zero criticals |
| No OWASP Top 10 vulnerabilities | OWASP ZAP scan report |
| PII not present in logs | Grep of Loki logs for test email addresses |
| Recording access is role-gated | Penetration test: AGENT role returns 403 |
| Audit log is immutable | Attempt UPDATE/DELETE on `audit_logs` fails at DB level |
| Tokens expire correctly | JWT with expired token returns 401 |
| Rate limiting blocks brute force | 100 rapid auth attempts triggers rate limit |
| DTMF pause works for payments | Manual test during QA sign-off |

---

## Week 23 — Security Hardening

### Objectives
Systematic security hardening across all layers: dependency audit, Keycloak hardening, API security headers, rate limiting review, and PII audit.

### Tasks

#### 23.1 Dependency Security Audit

```bash
# Full dependency audit
pnpm audit --audit-level critical

# Check for known vulnerable dependencies
npx better-npm-audit audit

# Python dependencies
pip-audit -r requirements.txt

# Docker image scanning
docker scout cves ghcr.io/ccmp/api:latest
docker scout cves ghcr.io/ccmp/web:latest

# Set up automated scanning in CI
# .github/workflows/security.yml — runs on every PR
```

Fix all critical and high severity vulnerabilities before go-live. Medium severity must be documented with a remediation timeline.

#### 23.2 Keycloak Production Hardening

```json
// config/keycloak/realm-export.json — production settings

{
  "realm": "ccmp",
  "sslRequired": "all",              // Force HTTPS everywhere
  "bruteForceProtected": true,       // Block brute force
  "maxFailureWaitSeconds": 900,      // 15-min lockout after repeated failures
  "maxDeltaTimeSeconds": 43200,      // 12-hour failure window
  "failureFactor": 10,               // Lock after 10 failures
  "waitIncrementSeconds": 60,

  "passwordPolicy": "length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername() and passwordHistory(5)",

  "otpPolicyType": "totp",           // TOTP-based MFA
  "otpPolicyAlgorithm": "HmacSHA256",

  "clients": [{
    "clientId": "ccmp-web",
    "accessTokenLifespan": 900,      // 15-minute access tokens
    "refreshTokenMaxReuse": 0,       // Single-use refresh tokens
    "revokeRefreshToken": true,
    "attributes": {
      "access.token.lifespan": "900",
      "client.offline.session.max.lifespan": "86400"
    }
  }],

  "requiredActions": [
    { "alias": "CONFIGURE_TOTP", "enabled": true,
      "defaultAction": true }        // Force MFA setup on first login
  ]
}
```

> MFA must be mandatory for SUPERVISOR, QA_ANALYST, COMPLIANCE_OFFICER, and ADMIN roles. AGENT role MFA is strongly recommended but can be phased in post-launch.

#### 23.3 HTTP Security Headers

```typescript
// apps/api/src/middleware/security.ts
// Framework-agnostic equivalents — helmet, cors, express-rate-limit are all
// plain Express middleware; no plugin system needed.

import { Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { createClient } from 'redis'

export async function applySecurityMiddleware(app: Application): Promise<void> {
  // ── Security headers (helmet replaces @fastify/helmet) ─────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],  // Required for Tailwind
        imgSrc:         ["'self'", 'data:', 'blob:'],
        connectSrc:     ["'self'", 'wss:'],             // Allow WebSocket
        mediaSrc:       ["'self'", 'blob:'],            // Allow audio playback
        objectSrc:      ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    hsts:             { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy:   { policy: 'strict-origin-when-cross-origin' }
  }))

  // ── CORS (cors replaces @fastify/cors) ─────────────────────────────────────
  app.use(cors({
    origin:         process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Idempotency-Key'],
    credentials:    true
  }))

  // ── Global rate limit: 200 req/min per IP, backed by Redis ─────────────────
  const redisClient = createClient({ url: process.env.REDIS_URL })
  await redisClient.connect()

  const globalLimiter = rateLimit({
    windowMs:       60_000,                 // 1 minute
    max:            200,
    standardHeaders: true,
    legacyHeaders:  false,
    store:          new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args)
    }),
    keyGenerator:   (req) => req.ip ?? 'unknown',
    handler:        (_req, res) => res.status(429).json({
      error:      'Too Many Requests',
      message:    'Rate limit exceeded. Please wait before retrying.',
      retryAfter: 60
    })
  })
  app.use(globalLimiter)

  // ── Auth endpoint stricter limit: 10 req/min ────────────────────────────────
  // Express equivalent of fastify.addHook('onRoute') is simply path-scoped middleware
  const authLimiter = rateLimit({
    windowMs:        60_000,
    max:             10,
    standardHeaders: true,
    store:           new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args)
    }),
    handler:         (_req, res) => res.status(429).json({ error: 'Too many auth attempts' })
  })
  app.use('/api/v1/auth', authLimiter)
  app.use('/api/auth',    authLimiter)
}
```

Register in `app.ts` **before** all routes:

```typescript
// apps/api/src/app.ts
import { applySecurityMiddleware } from './middleware/security'
// ...
await applySecurityMiddleware(app)
// then mount routers
```

#### 23.4 PII Audit

Run a complete scan to prove no PII leaks in any log output or search index:

```bash
#!/bin/bash
# scripts/pii-audit.sh

echo "=== PII Audit ==="

# 1. Check Loki logs for real email addresses
# Inject a test email, then verify it doesn't appear in logs
TEST_EMAIL="pii-audit-test-$(date +%s)@example.com"

# Trigger an API call with the test email in payload
curl -X POST ${API_URL}/api/v1/cases \
  -H "Authorization: Bearer ${TEST_TOKEN}" \
  -d '{"customerEmail": "'"${TEST_EMAIL}"'", "subject": "PII test", "channel": "EMAIL"}'

sleep 10  # Wait for log shipping

# Query Loki for the test email
LOKI_RESULT=$(curl -s "${LOKI_URL}/loki/api/v1/query" \
  --data-urlencode "query={app=\"ccmp-api\"} |= \"${TEST_EMAIL}\"")

MATCHES=$(echo $LOKI_RESULT | jq '.data.result | length')
if [ "$MATCHES" -gt "0" ]; then
  echo "❌ FAIL: PII found in logs! Email appeared in Loki."
  echo $LOKI_RESULT | jq '.data.result[].values'
  exit 1
else
  echo "✅ PASS: No PII found in logs."
fi

# 2. Check Meilisearch does not contain PII in search snippets
# (customerEmail should not be in the searchable fields index)
SEARCH_RESULT=$(curl -s "${MEILI_URL}/indexes/cases/search" \
  -H "Authorization: Bearer ${MEILI_API_KEY}" \
  -d '{"q": "'"${TEST_EMAIL}"'"}')

HITS=$(echo $SEARCH_RESULT | jq '.hits | length')
echo "Meilisearch hits for test email: ${HITS} (expected: 0 in search results)"
```

#### 23.5 OWASP ZAP Automated Scan

```bash
# Run OWASP ZAP in docker against staging environment
docker run -t owasp/zap2docker-stable zap-api-scan.py \
  -t "${STAGING_URL}/api/openapi.json" \
  -f openapi \
  -r zap-report.html \
  -J zap-report.json \
  -l WARN

# Parse results — fail CI if any CRITICAL findings
CRITICAL=$(jq '.site[].alerts[] | select(.riskcode == "3")' zap-report.json | jq -s length)
if [ "$CRITICAL" -gt "0" ]; then
  echo "❌ OWASP ZAP found ${CRITICAL} critical vulnerabilities. Block release."
  exit 1
fi
```

### Deliverables
- [ ] Zero critical dependency CVEs (`pnpm audit` clean)
- [ ] OWASP ZAP scan: zero critical, zero high vulnerabilities
- [ ] Keycloak MFA enforced for Supervisor+ roles
- [ ] JWT tokens expire at 15 minutes and verified
- [ ] Rate limiting: 10 rapid auth attempts trigger lockout
- [ ] PII audit script runs clean (no emails in logs)
- [ ] All security headers present (`curl -I` verification)

---

## Week 24 — Admin Module

### Objectives
Build the Admin module that allows non-engineers to manage every operational aspect of the CCMP: routing rules, SLA policies, user management, queue configuration, and system health.

### Admin Module Sections

| Section | Who Uses It | Key Actions |
|---|---|---|
| User Management | Admin | Create/deactivate users, assign roles, force password reset |
| Team Management | Admin | Create teams, assign agents, set timezone |
| Queue Configuration | Admin, Supervisor | Create queues, set skills, set capacity |
| Routing Rules | Admin, Supervisor | Create/edit/reorder rules, enable/disable, dry-run |
| SLA Policies | Admin | Set first-response and resolution targets per priority |
| System Health | Admin | Service statuses, job queue depths, error rates |

### Tasks

#### 24.1 Routing Rule Builder API

```typescript
// POST /api/v1/admin/routing-rules
// PATCH /api/v1/admin/routing-rules/:id
// DELETE /api/v1/admin/routing-rules/:id
// POST /api/v1/admin/routing-rules/reorder
// POST /api/v1/admin/routing-rules/:id/dry-run  ← Test rule without saving

interface RoutingCondition {
  field:    'language' | 'issue_type' | 'customer_tier' | 'channel' | 'priority'
  operator: 'equals' | 'not_equals' | 'contains' | 'in'
  value:    string | string[]
}

interface RoutingAction {
  type:  'assign_to_queue' | 'assign_to_role' | 'set_priority' | 'assign_to_agent'
  value: string
}

async createRoutingRule(data: {
  name: string
  conditions: RoutingCondition[]
  actions: RoutingAction[]
  priorityOrder: number
}) {
  const rule = await prisma.routingRule.create({ data })

  // Invalidate routing rules cache in Redis immediately
  await redis.del(RedisKeys.routingRules())
  await redis.del(RedisKeys.routingRuleHash())

  // Audit
  await auditService.log({
    action: 'routing_rule.created',
    resourceType: 'routing_rule',
    resourceId: rule.id,
    metadata: { name: rule.name, conditionCount: data.conditions.length }
  })

  return rule
}

// Dry-run: test a rule set against a hypothetical case without saving
async dryRunRoutingRules(hypotheticalCase: Partial<Case>): Promise<RoutingDecision> {
  const rules = await prisma.routingRule.findMany({
    where: { isActive: true },
    orderBy: { priorityOrder: 'asc' }
  })

  for (const rule of rules) {
    if (evaluateConditions(rule.conditions, hypotheticalCase)) {
      return {
        matchedRule: rule.name,
        actions: rule.actions,
        confidence: 'exact_match'
      }
    }
  }

  return { matchedRule: 'DEFAULT_ROUND_ROBIN', actions: [{ type: 'round_robin' }], confidence: 'fallback' }
}
```

#### 24.2 Routing Rule Builder UI

```tsx
// apps/web/src/app/(admin)/routing-rules/page.tsx

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [dragging, setDragging] = useState<string | null>(null)

  // Drag-and-drop reordering (priority_order = position in list)
  const handleDragEnd = async (result: DropResult) => {
    const reordered = reorderList(rules, result.source.index, result.destination.index)
    setRules(reordered)
    await reorderRules(reordered.map((r, i) => ({ id: r.id, priorityOrder: i + 1 })))
  }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h1>Routing Rules</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowDryRun(true)}>Dry Run Test</Button>
          <Button onClick={() => setShowCreate(true)}>+ New Rule</Button>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="rules">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {rules.map((rule, index) => (
                <Draggable key={rule.id} draggableId={rule.id} index={index}>
                  {(provided) => (
                    <RoutingRuleCard
                      rule={rule}
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      dragHandleProps={provided.dragHandleProps}
                    />
                  )}
                </Draggable>
              ))}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  )
}
```

#### 24.3 System Health Dashboard (Admin)

```typescript
// GET /api/v1/admin/system-health

async getSystemHealth() {
  const [
    dbStatus,
    redisStatus,
    bullmqStats,
    freeswitchStatus,
    minioStatus,
    meiliStatus
  ] = await Promise.allSettled([
    prismaWrite.$queryRaw`SELECT 1`,
    redis.ping(),
    getBullmqStats(),
    checkEslConnection(),
    minio.listBuckets(),
    meili.health()
  ])

  return {
    services: {
      database:    dbStatus.status === 'fulfilled'    ? 'healthy' : 'degraded',
      redis:       redisStatus.status === 'fulfilled' ? 'healthy' : 'degraded',
      telephony:   freeswitchStatus.status === 'fulfilled' ? 'healthy' : 'degraded',
      storage:     minioStatus.status === 'fulfilled' ? 'healthy' : 'degraded',
      search:      meiliStatus.status === 'fulfilled' ? 'healthy' : 'degraded',
    },
    queues: bullmqStats.status === 'fulfilled' ? {
      sla:          bullmqStats.value.sla,
      csat:         bullmqStats.value.csat,
      notifications: bullmqStats.value.notifications,
      dlq:          bullmqStats.value.dlq   // Alert if > 0
    } : null,
    timestamp: new Date()
  }
}
```

#### 24.4 Admin Audit Trail

All admin actions are logged with full detail:

```typescript
// apps/api/src/middleware/adminAudit.ts
// Express equivalent: use res.on('finish') — fires after response is sent,
// exactly like fastify.addHook('onResponse').

import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'

function extractResourceId(url: string): string {
  const parts = url.split('/')
  // /api/v1/admin/routing-rules/abc123 → 'abc123'
  return parts[parts.length - 1] ?? 'unknown'
}

export function adminAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', async () => {
    if (
      req.path.startsWith('/api/v1/admin') &&
      ['POST','PATCH','PUT','DELETE'].includes(req.method) &&
      res.statusCode < 400 &&
      req.user  // guard: only log authenticated requests
    ) {
      try {
        await prisma.auditLog.create({
          data: {
            actorId:      req.user.id,
            actorEmail:   req.user.email,
            resourceType: 'admin_action',
            resourceId:   extractResourceId(req.path),
            action:       `admin.${req.method.toLowerCase()}`,
            ipAddress:    req.ip,
            sessionId:    req.user.sessionId,
            metadata: {
              endpoint:   req.path,
              statusCode: res.statusCode
            }
          }
        })
      } catch (err) {
        // Never let audit log failure break the response
        console.error('Admin audit log write failed:', err)
      }
    }
  })
  next()
}
```

Register in `app.ts` (applies to all routes; the `path.startsWith` guard inside is selective):

```typescript
import { adminAuditMiddleware } from './middleware/adminAudit'
app.use(adminAuditMiddleware)
```

### Deliverables
- [ ] Routing rule CRUD API with dry-run capability
- [ ] Drag-to-reorder routing rules works and updates `priority_order`
- [ ] SLA policy editor functional
- [ ] User management: create, deactivate, role change
- [ ] Queue configuration: create, edit, set skills/languages
- [ ] System health dashboard shows real-time service status
- [ ] All admin actions logged to audit trail

---

## Week 25 — Email Integration & Notifications

### Objectives
Build reliable transactional email for agent notifications, CSAT surveys, and daily summaries. Implement a notification preference centre for agents.

### Tasks

#### 25.1 Email Service (Nodemailer + SMTP)

```typescript
// apps/api/src/modules/notifications/email.service.ts
import nodemailer from 'nodemailer'
import { renderAsync } from '@react-email/render'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
})

export async function sendEmail(options: EmailOptions) {
  const html = await renderAsync(options.template(options.variables))

  const info = await transporter.sendMail({
    from:    `"CCMP" <${process.env.SMTP_FROM}>`,
    to:      options.to,
    subject: options.subject,
    html,
    // Text fallback for accessibility
    text:    options.textFallback ?? html.replace(/<[^>]*>/g, '')
  })

  // Log for audit
  logger.info({ messageId: info.messageId, to: '[REDACTED]' }, 'Email sent')
  return info
}
```

#### 25.2 Notification Templates

Create React Email templates (rendered server-side to HTML):

```tsx
// apps/api/src/templates/SlaWarningEmail.tsx
import { Html, Body, Container, Heading, Text, Button } from '@react-email/components'

export function SlaWarningEmail({ caseNumber, agentName, minutesRemaining, caseUrl }) {
  return (
    <Html>
      <Body>
        <Container>
          <Heading>⚠️ SLA Warning — {caseNumber}</Heading>
          <Text>Hi {agentName},</Text>
          <Text>
            Case {caseNumber} has {minutesRemaining} minutes remaining before
            SLA breach. Please update or escalate this case immediately.
          </Text>
          <Button href={caseUrl}>Open Case</Button>
        </Container>
      </Body>
    </Html>
  )
}
```

Templates needed:
- `SlaWarningEmail` — SLA warning at 80%
- `SlaBreachEmail` — SLA has been breached
- `CaseAssignedEmail` — New case assigned
- `QaReviewCompletedEmail` — QA review score available
- `DailySummaryEmail` — Supervisor/manager daily KPI digest
- `CsatSurveyEmail` — Customer satisfaction survey
- `WelcomeEmail` — New user account created

#### 25.3 Notification Preference Centre

```prisma
// Add to schema
model NotificationPreference {
  id          String  @id @default(cuid())
  userId      String  @unique @map("user_id")
  emailSlaWarning    Boolean @default(true)
  emailCaseAssigned  Boolean @default(true)
  emailQaReview      Boolean @default(true)
  emailDailySummary  Boolean @default(true)
  browserPush        Boolean @default(true)

  user        User    @relation(fields: [userId], references: [id])
  @@map("notification_preferences")
}
```

Agents can update their preferences at `/settings/notifications`. Always check preferences before sending.

#### 25.4 Daily Summary BullMQ Job

```typescript
// Cron: every day at 07:00 UTC
async sendDailySummaryEmails() {
  const supervisors = await prisma.user.findMany({
    where: { role: { in: ['SUPERVISOR', 'OPERATIONS_MANAGER'] }, isActive: true }
  })

  for (const supervisor of supervisors) {
    const yesterday = getYesterday()
    const summary = await buildDailySummary(supervisor.teamId, yesterday)

    await emailService.send({
      to: supervisor.email,
      subject: `CCMP Daily Summary — ${yesterday.toDateString()}`,
      template: DailySummaryEmail,
      variables: summary
    })
  }
}
```

### Deliverables
- [ ] SMTP configured and verified in staging
- [ ] All 7 email templates rendered and tested
- [ ] SLA warning email fires correctly in staging
- [ ] Daily summary email tested with real data
- [ ] Notification preferences UI functional
- [ ] Preferences respected: disabled notifications not sent

---

## Week 26 — Staging Environment & UAT

### Objectives
Stand up a production-equivalent staging environment. Run User Acceptance Testing with real operations staff. Fix all UAT issues before go-live.

### Tasks

#### 26.1 Staging Environment Setup

Staging should be:
- Identical to production configuration (same Docker Compose, same Traefik config)
- Populated with anonymised production-like data (not real customer data)
- Accessible via `staging.ccmp.yourcompany.com`
- Reset weekly via automated script

```bash
# scripts/staging-reset.sh
# Wipe staging DB, re-migrate, re-seed with anonymised data

docker compose -f docker-compose.staging.yml exec postgres \
  psql -U ccmp_user -c "DROP DATABASE IF EXISTS ccmp_staging; CREATE DATABASE ccmp_staging;"

DATABASE_URL="postgresql://ccmp_user:...@postgres:5432/ccmp_staging" \
  pnpm prisma migrate deploy

DATABASE_URL="..." pnpm prisma db seed -- --env staging
```

#### 26.2 UAT Test Plan

Run UAT with at least one person from each role. Each tester follows this script:

```
AGENT UAT SCRIPT
────────────────
1. Log in with AGENT credentials
2. Verify you can only see cases assigned to you
3. Create a case manually (Web Form channel)
4. Update case status from IN_PROGRESS to WAITING_ON_CUSTOMER
5. Add a note to the case
6. Search for a case by customer name
7. Verify SLA badge updates correctly
8. Log out

SUPERVISOR UAT SCRIPT
────────────────────
1. Log in with SUPERVISOR credentials
2. View the live queue monitor
3. Reassign a case from one agent to another
4. Force-escalate a case
5. Override SLA on a case (extend by 1 hour)
6. View the SLA heatmap
7. Export a cases report as CSV

QA ANALYST UAT SCRIPT
─────────────────────
1. Log in with QA_ANALYST credentials
2. Open the QA review queue
3. Open a case with a recording
4. Play the recording (verify access logged)
5. Submit a QA review with score + compliance flag
6. Verify agent is notified

COMPLIANCE UAT SCRIPT
─────────────────────
1. Log in with COMPLIANCE_OFFICER credentials
2. Access the audit log viewer
3. Filter by a specific agent's activity
4. Export a date-range audit trail as PDF
5. Verify the signed PDF opens and shows tamper-evidence metadata
6. Confirm you cannot edit any case or log entry
```

#### 26.3 UAT Issue Tracking

All UAT issues tracked with these severity levels:

| Severity | Definition | Go-Live Decision |
|---|---|---|
| P0 — Blocker | Prevents core workflow from functioning | Must fix before go-live |
| P1 — Critical | Major feature broken or data incorrect | Must fix before go-live |
| P2 — Major | Feature works but UX is poor or slow | Fix within 2 weeks post-go-live |
| P3 — Minor | Cosmetic, spelling, edge case | Fix in next sprint |

**Go-live gate: Zero P0/P1 issues open.**

### Deliverables
- [ ] Staging environment live and stable for 1 week
- [ ] All 5 role UAT scripts completed by real users
- [ ] All P0 and P1 UAT issues fixed and re-tested
- [ ] UAT sign-off obtained from operations lead
- [ ] Staging performance matches production targets (k6 smoke test)

---

## Week 27 — Production Go-Live Preparation

### Objectives
Prepare every operational detail for go-live. Write runbooks, prepare rollback plan, configure monitoring alerts, brief the on-call team.

### Tasks

#### 27.1 Go-Live Readiness Checklist

```markdown
## Infrastructure
- [ ] Production server provisioned (min 8 vCPU / 32GB RAM)
- [ ] Domain and DNS configured (ccmp.yourcompany.com)
- [ ] TLS certificates provisioned via Let's Encrypt
- [ ] Firewall rules: only 80/443/22 exposed
- [ ] Backup server configured and tested
- [ ] Monitoring alerts configured (PagerDuty or Slack)

## Application
- [ ] All Phase 1–5 features deployed to production
- [ ] Database migration ran cleanly on production DB
- [ ] Seed data loaded (queues, SLA policies, routing rules, initial admin user)
- [ ] Keycloak realm imported with production config
- [ ] FreeSWITCH registered with production SIP provider
- [ ] MinIO buckets created with encryption and retention policies

## Security
- [ ] OWASP ZAP scan on production URL (not staging) — zero criticals
- [ ] TLS rating A+ on SSL Labs
- [ ] All admin accounts have MFA enabled
- [ ] API keys rotated from staging values
- [ ] Audit log immutability verified on production DB

## Observability
- [ ] Grafana dashboards live with production data
- [ ] Loki ingesting production logs
- [ ] Prometheus scraping all services
- [ ] Alertmanager configured: PagerDuty for P0, Slack for P1
- [ ] On-call rotation set up for first 30 days

## People
- [ ] All agents trained (30-min walkthrough session)
- [ ] Supervisors trained (60-min session with Q&A)
- [ ] Operations manager trained on reports and exports
- [ ] IT admin trained on user management and routing rules
- [ ] Compliance officer trained on audit export workflow
- [ ] On-call runbook distributed to engineering team
```

#### 27.2 Alert Configuration

```yaml
# config/grafana/alerts/production.yml

groups:
  - name: ccmp-critical
    rules:
      - alert: ApiHighErrorRate
        expr: rate(ccmp_http_request_errors_total[5m]) > 0.05
        for: 2m
        labels: { severity: critical }
        annotations:
          summary: "API error rate > 5% for 2 minutes"

      - alert: SlaBreachSpike
        expr: increase(ccmp_sla_breaches_total[15m]) > 20
        labels: { severity: warning }
        annotations:
          summary: "20+ SLA breaches in last 15 minutes"

      - alert: DbConnectionPoolExhausted
        expr: pgbouncer_pools_cl_waiting > 50
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "PgBouncer: 50+ clients waiting for connection"

      - alert: DlqJobsAccumulating
        expr: bullmq_dlq_size > 10
        labels: { severity: warning }
        annotations:
          summary: "Dead Letter Queue exceeds 10 items"

      - alert: AgentPresenceDropped
        expr: ccmp_active_agents < 5
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Fewer than 5 agents online for 5+ minutes"

      - alert: FreeSwitchDown
        expr: freeswitch_up == 0
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "FreeSWITCH appears to be down"
```

#### 27.3 On-Call Runbook

```markdown
# CCMP On-Call Runbook v1.0

## Contact Tree
- L1 On-Call Engineer: [Name] [Phone]
- L2 Tech Lead: [Name] [Phone]
- L3 Architecture Lead: [Name] [Phone]

## Common Incidents & Responses

### API is down (5xx spike)
1. `docker compose ps` — check all services are running
2. `docker compose logs api --tail 100` — check for errors
3. Check Grafana: DB connections, Redis memory, BullMQ queue depth
4. If DB issue: check PgBouncer pool (`docker exec pgbouncer psql -c SHOW POOLS`)
5. Escalate to L2 if not resolved in 15 minutes

### FreeSWITCH unreachable (no calls connecting)
1. `docker compose restart freeswitch`
2. Monitor ESL reconnection in API logs: `docker compose logs api | grep ESL`
3. If SIP registration fails: check SIP provider status page
4. Activate backup SIP trunk if available

### SLA jobs not firing
1. Check BullMQ worker: `docker compose ps worker`
2. Check DLQ: query Redis `LLEN ccmp:bullmq:sla:dead`
3. If worker crashed: `docker compose restart worker`
4. Replay DLQ if < 100 items: `pnpm worker:replay-dlq`

### Disk space (MinIO or Postgres)
1. Check: `df -h /var/lib/docker`
2. If MinIO: trigger manual retention cleanup `pnpm worker:recording-cleanup`
3. If Postgres: run `VACUUM ANALYZE` on largest partitions
4. Page L2 if < 10% disk free

### High memory (Postgres or Redis)
1. Check slow queries: `docker exec postgres psql -U ccmp_user -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5"`
2. Check Redis memory: `docker exec redis redis-cli INFO memory`
3. If Redis OOM: check for key TTL issues `OBJECT ENCODING [key]`
```

#### 27.4 Rollback Plan

```bash
#!/bin/bash
# scripts/rollback.sh VERSION
# Usage: ./rollback.sh v1.2.3

VERSION=$1
echo "=== Rolling back to ${VERSION} ==="

# 1. Pull previous images
docker pull ghcr.io/ccmp/api:${VERSION}
docker pull ghcr.io/ccmp/web:${VERSION}

# 2. Roll back application (zero-downtime with Traefik)
docker compose up -d --no-deps api=ghcr.io/ccmp/api:${VERSION}
docker compose up -d --no-deps web=ghcr.io/ccmp/web:${VERSION}

# 3. If DB migration needs rollback (rare — only for additive-only misses)
# pnpm prisma migrate resolve --rolled-back <migration_name>

echo "=== Rollback complete. Verify health: curl ${API_URL}/health ==="
```

### Deliverables
- [ ] Go-live readiness checklist: all items checked
- [ ] All monitoring alerts configured and tested (fire a test alert)
- [ ] On-call runbook distributed to all engineers
- [ ] Rollback plan documented and rehearsed in staging
- [ ] Training sessions completed for all role groups

---

## Week 28 — Go-Live & Hypercare

### Objectives
Execute go-live. Provide hypercare support for the first week. Monitor closely. Fix any issues that emerge from real traffic.

### Tasks

#### 28.1 Go-Live Sequence

```
Hour -48: Final smoke test on production (all UAT scripts re-run)
Hour -24: Freeze all non-critical changes; notify team
Hour -04: Alert on-call team; open war-room Slack channel
Hour -01: Final health check on all services
Hour  00: Go-live
           ↓
           Migrate first team (5 agents, 1 supervisor)
           Monitor for 2 hours
           ↓
           If stable: expand to all agents
           If issues: rollback immediately, diagnose
Hour +08: First health review call with ops team
Day   +1: Review Grafana dashboards; check overnight jobs
Day   +3: Review SLA performance with operations manager
Day   +7: Hypercare review; publish known issues list
```

#### 28.2 Canary Release Strategy

Don't go live all at once. Use a phased team rollout:

```
Week 1, Day 1: Team A (5 agents) — Validate core case workflow
Week 1, Day 3: Teams A + B (20 agents) — Validate routing at volume
Week 1, Day 5: Full rollout (all agents) — Complete migration
```

After each expansion, run this health check:

```bash
#!/bin/bash
# scripts/health-check.sh

echo "=== CCMP Production Health Check ==="
echo ""

# API health
STATUS=$(curl -s -o /dev/null -w "%{http_code}" ${API_URL}/health)
echo "API: ${STATUS}"

# DB connection
DB_OK=$(docker exec pgbouncer psql -t -c "SELECT 1" 2>&1)
echo "DB: $([ $? -eq 0 ] && echo "OK" || echo "FAIL")"

# Redis
REDIS_OK=$(docker exec redis redis-cli ping 2>&1)
echo "Redis: ${REDIS_OK}"

# FreeSWITCH
FS_OK=$(docker exec freeswitch fs_cli -x "status" 2>&1 | head -1)
echo "FreeSWITCH: ${FS_OK}"

# Active agents (should be > 0 during business hours)
AGENTS=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" ${API_URL}/api/v1/admin/system-health | jq '.services')
echo "Services: ${AGENTS}"

# BullMQ DLQ
DLQ=$(docker exec redis redis-cli LLEN "ccmp:bullmq:sla:dead" 2>&1)
echo "DLQ depth: ${DLQ} (should be 0)"

echo ""
echo "=== Health check complete ==="
```

#### 28.3 Post-Launch Metrics Targets

By Day 7 of production, confirm these operational metrics:

| Metric | Target | How to Measure |
|---|---|---|
| System uptime | > 99.5% | Grafana uptime panel |
| API p95 latency | < 200ms | Grafana API latency panel |
| SLA compliance rate | > 90% (initial target) | Reports → SLA Breach Rate |
| Agent case throughput | Baseline established | Reports → Case Volume |
| Error rate | < 0.1% | Grafana error rate panel |
| No P0 incidents | 0 | Incident log |
| Audit log completeness | 100% of actions logged | Spot-check audit log |

### Deliverables
- [ ] Go-live executed successfully
- [ ] Canary rollout: Team A stable before full expansion
- [ ] All agents successfully logged in and handling cases
- [ ] Grafana showing real traffic with no alerts firing
- [ ] Day-7 hypercare review completed
- [ ] All post-launch metric targets met

---

## Phase 5 Definition of Done

| Check | Criteria |
|---|---|
| ✅ Security | Zero critical/high vulnerabilities; OWASP ZAP clean; MFA enforced |
| ✅ Admin Module | All admin operations work without engineering involvement |
| ✅ Notifications | Email templates sent; preferences respected; daily summary working |
| ✅ UAT | All role scripts passed; zero P0/P1 UAT issues |
| ✅ Observability | All alerts configured; on-call runbook distributed |
| ✅ Go-Live | Platform live; canary rollout complete; Day-7 review passed |

---

## Project Completion Checklist

With Phase 5 complete, the CCMP is production-ready. Confirm the following before closing the project:

- [ ] All 5 phase ADRs written and committed
- [ ] API documentation generated (Swagger/OpenAPI via `swagger-ui-express` + `swagger-jsdoc`)
- [ ] Architecture diagram updated to reflect final state
- [ ] Disaster recovery runbook tested and timed (< 2 hours restore proven)
- [ ] Security scan results archived for compliance
- [ ] Performance test results archived with timestamps
- [ ] Data retention policy signed off by compliance team
- [ ] Keycloak admin password stored in secrets manager (not .env)
- [ ] Production `.env` never committed to git (verified)
- [ ] Team onboarding guide written for future engineers

---

## What Comes After Phase 5

These capabilities are explicitly out of scope for the MVP but are the natural next investments:

| Future Enhancement | When to Consider |
|---|---|
| Kubernetes migration | When scaling beyond single-host Docker Compose |
| AI-powered routing | After 6 months of routing rule data accumulation |
| CRM integration (Salesforce, HubSpot) | When customer data duplication becomes painful |
| Conversational chatbot (Rasa, Botpress) | When chat volume exceeds agent capacity |
| Multi-tenant architecture | When onboarding second business unit or client |
| Advanced analytics (Apache Superset) | When Recharts reports hit their limits |
| Voice transcription (Whisper) | When QA team asks to search call content |

---

*Phase 5 of 5 · CCMP Implementation Roadmap · Prev: [Phase 4](./Phase-4_Scalability-and-Performance.md) · Project Complete*

---

## 🔍 Requirements Audit — Phase 5

### Gap Analysis

| ID | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| G5-01 | 🔴 Critical | §24.1–24.2 | Admin routing rules API and UI described but **no Express router** implementation | **Missing** — Add `admin.router.ts` (see fix below) |
| G5-02 | 🔴 Critical | §25.1–25.2 | `sendEmail()` and `SlaWarningEmail` referenced but no send-call wired to the SLA worker | **Missing** — Wire `emailService.send()` into SLA breach/warning workers (Phase 2 §6.2) |
| G5-03 | 🔴 Critical | §26.2 | 5 UAT scripts defined in prose but no **UAT user provisioning** script to create test accounts | **Missing** — Add `scripts/provision-uat-accounts.sh` |
| G5-04 | 🔴 Critical | §28.2 | Canary release described in prose but no automation script to gate expansion | **Missing** — Add `scripts/canary-expand.sh` with health-gate logic |
| G5-05 | 🟡 Important | §23.3 | Security middleware provided (new Express version) but no `swagger-ui-express` setup mentioned despite Project Completion Checklist referencing OpenAPI docs | **Missing** — Add `swagger.ts` bootstrap and mount in `app.ts` |
| G5-06 | 🟡 Important | §25.3 | `NotificationPreference` model added — requires a **new Prisma migration** not called out | **Flag** — Add to migration checklist before deploying Phase 5 |
| G5-07 | 🟡 Important | §27.2 | Grafana alert YAML references `ccmp_http_request_errors_total` metric but Phase 3 §17.1 only defines `ccmp_http_request_duration_seconds` | **Fix** — Add error counter: `httpRequestErrors: new Counter({ name: 'ccmp_http_request_errors_total', ... })` |

**Actionable fix for G5-01 — Admin router:**
```typescript
// apps/api/src/modules/admin/admin.router.ts
import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { AdminService } from './admin.service'

const router  = Router()
const service = new AdminService()
const ADMIN   = ['ADMIN']
const ADMIN_SUP = ['ADMIN','SUPERVISOR']

// ── Routing Rules ───────────────────────────────────────────────────────────
router.get   ('/routing-rules',           requireRole(ADMIN_SUP), async (req, res) => {
  res.json(await service.listRoutingRules())
})
router.post  ('/routing-rules',           requireRole(ADMIN),     async (req, res) => {
  res.status(201).json(await service.createRoutingRule(req.body, req.user!))
})
router.patch ('/routing-rules/:id',       requireRole(ADMIN),     async (req, res) => {
  res.json(await service.updateRoutingRule(req.params.id, req.body, req.user!))
})
router.delete('/routing-rules/:id',       requireRole(ADMIN),     async (req, res) => {
  await service.deleteRoutingRule(req.params.id, req.user!)
  res.status(204).send()
})
router.post  ('/routing-rules/reorder',   requireRole(ADMIN),     async (req, res) => {
  await service.reorderRoutingRules(req.body.order)
  res.status(204).send()
})
router.post  ('/routing-rules/:id/dry-run', requireRole(ADMIN_SUP), async (req, res) => {
  res.json(await service.dryRunRoutingRules(req.body))
})

// ── SLA Policies ────────────────────────────────────────────────────────────
router.get   ('/sla-policies',            requireRole(ADMIN_SUP), async (req, res) => {
  res.json(await service.listSlaPolicies())
})
router.post  ('/sla-policies',            requireRole(ADMIN),     async (req, res) => {
  res.status(201).json(await service.createSlaPolicy(req.body))
})
router.patch ('/sla-policies/:id',        requireRole(ADMIN),     async (req, res) => {
  res.json(await service.updateSlaPolicy(req.params.id, req.body))
})

// ── User Management ─────────────────────────────────────────────────────────
router.get   ('/users',                   requireRole(ADMIN),     async (req, res) => {
  res.json(await service.listUsers(req.query as any))
})
router.post  ('/users',                   requireRole(ADMIN),     async (req, res) => {
  res.status(201).json(await service.createUser(req.body))
})
router.patch ('/users/:id',               requireRole(ADMIN),     async (req, res) => {
  res.json(await service.updateUser(req.params.id, req.body))
})
router.delete('/users/:id',               requireRole(ADMIN),     async (req, res) => {
  await service.deactivateUser(req.params.id, req.user!)
  res.status(204).send()
})

// ── System Health ────────────────────────────────────────────────────────────
router.get   ('/system-health',           requireRole(ADMIN),     async (req, res) => {
  res.json(await service.getSystemHealth())
})

export { router as adminRouter }
// Mount in app.ts: app.use('/api/v1/admin', adminAuditMiddleware, adminRouter)
```

**Actionable fix for G5-03 — UAT account provisioner:**
```bash
#!/bin/bash
# scripts/provision-uat-accounts.sh
# Creates one test account per role in Keycloak + DB for UAT

set -e
KC_URL="${KEYCLOAK_URL}/admin/realms/ccmp"
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | jq -r '.access_token')

provision_user() {
  local username=$1 role=$2 email=$3
  echo "Provisioning ${role}: ${username}"
  curl -s -X POST "${KC_URL}/users" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${username}\",\"email\":\"${email}\",\"enabled\":true,
        \"credentials\":[{\"type\":\"password\",\"value\":\"UAT_Test123!\",\"temporary\":false}],
        \"realmRoles\":[\"${role}\"]}"
  echo "  ✅ ${role} created (password: UAT_Test123!)"
}

provision_user "uat-agent"       "AGENT"              "uat-agent@test.ccmp"
provision_user "uat-supervisor"  "SUPERVISOR"         "uat-supervisor@test.ccmp"
provision_user "uat-qa"          "QA_ANALYST"         "uat-qa@test.ccmp"
provision_user "uat-compliance"  "COMPLIANCE_OFFICER" "uat-compliance@test.ccmp"
provision_user "uat-admin"       "ADMIN"              "uat-admin@test.ccmp"

echo ""
echo "All UAT accounts provisioned. Login at: ${STAGING_URL}/login"
```

**Actionable fix for G5-04 — Canary expand script:**
```bash
#!/bin/bash
# scripts/canary-expand.sh TARGET_TEAM_COUNT
# Expands canary to next team after passing health gate

set -e
TARGET=$1
echo "=== Canary expansion — target: ${TARGET} teams ==="

# Run health checks
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health")
ERROR_RATE=$(curl -s "${METRICS_URL}/api/v1/query?query=rate(ccmp_http_request_errors_total[5m])" \
  | jq -r '.data.result[0].value[1] // "0"')

if [ "$API_STATUS" != "200" ]; then echo "❌ API health failed (${API_STATUS})"; exit 1; fi
if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then echo "❌ Error rate too high: ${ERROR_RATE}"; exit 1; fi

echo "✅ Health gate passed (status=${API_STATUS}, error_rate=${ERROR_RATE})"
echo "➡️  Expanding access to ${TARGET} teams. Update Keycloak group membership manually or via IDP."
```

**Actionable fix for G5-05 — Swagger/OpenAPI with Express:**
```typescript
// apps/api/src/swagger.ts
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import { Application } from 'express'

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'CCMP API', version: '1.0.0', description: 'Contact Centre Management Platform' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/modules/**/*.router.ts']  // Reads @openapi JSDoc comments
})

export function setupDocs(app: Application): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec))
  app.get('/api/openapi.json', (_req, res) => res.json(spec))
}
// Call setupDocs(app) in app.ts after all routers
```

---

## ✅ Phase 5 — Requirement Re-Verification Prompt

> **Instructions:** This is the final gate before production. Every item must be signed off with evidence. "Assumed working" blocks go-live.

| # | Requirement | Verification Method | Pass? |
|---|---|---|---|
| 1 | Zero critical CVEs in all dependencies | `pnpm audit --audit-level critical` exits 0 | ☐ |
| 2 | Zero high CVEs in all dependencies | `pnpm audit --audit-level high` exits 0 | ☐ |
| 3 | OWASP ZAP: zero critical findings | `zap-report.json` — `riskcode=3` count = 0 | ☐ |
| 4 | OWASP ZAP: zero high findings | `zap-report.json` — `riskcode=2` count = 0 | ☐ |
| 5 | Keycloak MFA enforced for SUPERVISOR+ roles | Log in as supervisor with no TOTP configured → forced to set up TOTP | ☐ |
| 6 | 15-minute JWT expiry enforced | Use token after 16 min → `401 Unauthorized` | ☐ |
| 7 | 10 rapid auth attempts trigger rate limit | Script 11 rapid POST `/auth/token` → 11th returns `429 Too Many Requests` | ☐ |
| 8 | HSTS header present | `curl -I https://staging.ccmp.com` → `strict-transport-security: max-age=31536000` | ☐ |
| 9 | CSP header present with correct directives | `curl -I` → `content-security-policy` includes `frame-ancestors 'none'` | ☐ |
| 10 | PII audit script clean | `./scripts/pii-audit.sh` → `✅ PASS` for all checks | ☐ |
| 11 | Admin routing rule CRUD works | Create → list → update → delete rule via API; verify DB reflects all changes | ☐ |
| 12 | Dry-run returns correct match | Create rule; dry-run with matching case → response includes `matchedRule` name | ☐ |
| 13 | Drag-to-reorder updates `priority_order` | Drag rule from position 3 to position 1; verify DB `priority_order` updated | ☐ |
| 14 | Routing rules cache invalidated on change | Update rule; within 5s routing engine uses new rule (no server restart needed) | ☐ |
| 15 | SLA warning email sends correctly | Trigger SLA warning; check SMTP logs / test inbox for email | ☐ |
| 16 | All 7 email templates render without error | `renderAsync()` each template with sample data → no exceptions | ☐ |
| 17 | Notification preferences respected | Disable `emailCaseAssigned`; assign case → no email sent | ☐ |
| 18 | All 5 UAT role scripts completed | UAT sign-off doc signed by operations lead | ☐ |
| 19 | Zero P0/P1 UAT issues open | Issue tracker: P0/P1 filter → 0 results | ☐ |
| 20 | Staging k6 smoke test passes all thresholds | `k6 run smoke.js --env BASE_URL=https://staging.ccmp.com` → all thresholds pass | ☐ |
| 21 | All monitoring alerts fire correctly | Trigger each alert condition manually → confirm Slack/PagerDuty notification | ☐ |
| 22 | TLS rating A+ on production | `ssllabs.com` scan on production domain → Grade A+ | ☐ |
| 23 | Audit log immutability proven on production DB | Attempt `UPDATE audit_logs` → Postgres exception raised | ☐ |
| 24 | All admin accounts have MFA enabled before go-live | Keycloak Admin: all ADMIN users show TOTP configured | ☐ |
| 25 | Canary Team A stable for 2h before full rollout | Grafana: 2h window with 0 errors from Team A traffic | ☐ |
| 26 | Day-7 post-launch metrics all green | SLA compliance > 90%; uptime > 99.5%; error rate < 0.1%; 0 P0 incidents | ☐ |
| 27 | OpenAPI docs accessible at `/api/docs` | `curl https://ccmp.com/api/docs` → 200 with Swagger UI HTML | ☐ |
| 28 | `NotificationPreference` migration applied to production | `SELECT count(*) FROM notification_preferences` → 0 rows (table exists) | ☐ |
| 29 | All 5 ADRs committed to repo | `ls docs/adr/` → 5 files present | ☐ |
| 30 | DR restore tested and timed < 2 hours | `time ./scripts/restore.sh <latest-backup>` → completes, rows match, under 2h | ☐ |

---
*Phase 5 of 5 · CCMP Implementation Roadmap · Express.js migration applied · Requirements audit complete*
