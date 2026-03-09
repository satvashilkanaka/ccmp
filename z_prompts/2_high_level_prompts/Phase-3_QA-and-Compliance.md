# Phase 3 — QA, Compliance & Analytics
### CCMP Implementation Roadmap · Weeks 12–17

> **Goal:** Build the oversight layer of the platform. QA analysts score agent performance and flag compliance violations. Compliance officers access immutable, tamper-evident audit trails. Operations managers get actionable reports and dashboards. By the end of this phase, the platform is auditable, measurable, and ready for regulatory review.

---

## Overview

| Attribute | Value |
|---|---|
| **Duration** | 6 Weeks |
| **Team Focus** | 2× Full-Stack (QA + Compliance UI), 1× Backend (reporting), 1× DevOps (observability) |
| **Primary Output** | QA module, compliance audit exports, analytics dashboards, CSAT surveys |
| **Depends On** | Phase 2 complete; recordings uploaded; SLA data accumulating |
| **Success Gate** | QA analyst completes full review without leaving UI; Compliance officer exports signed PDF audit trail |

---

## Week 12 — QA Review Module

### Objectives
Build the complete QA workflow: review queue, call playback, scoring rubric, compliance flags, and coaching notes. QA scores feed directly into the agent performance reports built in Week 14.

### Architecture

```
QA Review Workflow
─────────────────
QA Analyst opens review queue
     │
     ├──► Sees cases flagged for review (auto-flagged or supervisor-nominated)
     │
     ▼
Opens case detail
     │
     ├──► Plays recording via presigned MinIO URL (logged)
     ├──► Reads case timeline (events, notes, status changes)
     │
     ▼
Submits QA Review
     │
     ├──► Score (0–100) stored in qa_reviews
     ├──► Compliance flags stored (e.g., "missed_disclosure", "data_privacy_breach")
     ├──► Coaching notes attached
     └──► Agent notified via Socket.io
```

### Tasks

#### 12.1 QA Review Queue

Cases become eligible for QA review when:
- Status = `RESOLVED` or `CLOSED`
- Has at least one recording
- Has not already been reviewed in the current period

```typescript
// GET /api/v1/qa/queue
// Only accessible by QA_ANALYST role

async getQaQueue(analystId: string, filters: QaQueueFilters) {
  const { agentId, queueId, dateFrom, dateTo, unreviewed } = filters

  const cases = await prisma.case.findMany({
    where: {
      status: { in: ['RESOLVED', 'CLOSED'] },
      channel: 'PHONE',  // Only reviewed if there's a recording
      recordings: { some: {} },
      ...(unreviewed && { qaReviews: { none: {} } }),
      ...(agentId && { assignedTo: agentId }),
      ...(queueId && { queueId }),
      ...(dateFrom && { createdAt: { gte: dateFrom } }),
      ...(dateTo   && { createdAt: { lte: dateTo   } }),
    },
    include: {
      recordings: { select: { id: true, durationSec: true } },
      agent: { select: { displayName: true } },
      qaReviews: { select: { score: true, createdAt: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  return cases.map(c => ({
    ...c,
    reviewStatus: c.qaReviews.length > 0 ? 'reviewed' : 'pending',
    latestScore: c.qaReviews[0]?.score ?? null
  }))
}
```

#### 12.2 QA Scoring Rubric

Rubric is configurable in the Admin module (Phase 5). For now, use a seeded default:

```typescript
// packages/database/prisma/seed.ts — QA Rubric seed

const defaultRubric = {
  categories: [
    {
      id: 'opening',
      name: 'Professional Opening',
      weight: 10,
      items: [
        { id: 'greeting',    label: 'Used proper greeting script',         maxScore: 5 },
        { id: 'verified_id', label: 'Verified customer identity correctly', maxScore: 5 }
      ]
    },
    {
      id: 'resolution',
      name: 'Problem Resolution',
      weight: 40,
      items: [
        { id: 'understood',    label: 'Understood the customer issue',          maxScore: 10 },
        { id: 'resolved',      label: 'Resolved issue on first contact',        maxScore: 20 },
        { id: 'escalated_ok',  label: 'Escalation handled correctly if needed', maxScore: 10 }
      ]
    },
    {
      id: 'compliance',
      name: 'Compliance & Disclosures',
      weight: 30,
      items: [
        { id: 'recording_notice', label: 'Informed customer of call recording', maxScore: 10 },
        { id: 'pci_pause',        label: 'Used DTMF pause for card data',       maxScore: 10 },
        { id: 'data_handling',    label: 'Did not state PII aloud unnecessarily', maxScore: 10 }
      ]
    },
    {
      id: 'conduct',
      name: 'Professionalism',
      weight: 20,
      items: [
        { id: 'tone',    label: 'Maintained professional tone', maxScore: 10 },
        { id: 'closing', label: 'Proper call closing',         maxScore: 10 }
      ]
    }
  ]
}
```

#### 12.3 QA Review Submission API

```typescript
// POST /api/v1/qa/reviews
// Body: CreateQaReviewDto

interface CreateQaReviewDto {
  caseId:        string
  recordingId:   string
  scores:        { itemId: string; score: number }[]
  flags:         ComplianceFlag[]
  coachingNotes: string
}

type ComplianceFlag =
  | 'missed_recording_disclosure'
  | 'pci_dtmf_pause_not_used'
  | 'pii_stated_aloud'
  | 'inappropriate_conduct'
  | 'incorrect_escalation'
  | 'script_deviation'

async createQaReview(data: CreateQaReviewDto, reviewerId: string) {
  // Calculate weighted total score from rubric items
  const totalScore = calculateWeightedScore(data.scores)

  const review = await prisma.qaReview.create({
    data: {
      caseId:        data.caseId,
      reviewerId,
      agentId:       (await prisma.case.findUniqueOrThrow({ where: { id: data.caseId } })).assignedTo!,
      score:         totalScore,
      flags:         data.flags,
      coachingNotes: data.coachingNotes,
    }
  })

  // Audit the review itself
  await prisma.auditLog.create({
    data: {
      actorId:      reviewerId,
      resourceType: 'qa_review',
      resourceId:   review.id,
      action:       'created',
      metadata:     { caseId: data.caseId, score: totalScore, flagCount: data.flags.length }
    }
  })

  // Notify agent of new QA review
  await redis.publish('qa:review_completed', JSON.stringify({
    agentId: review.agentId,
    reviewId: review.id,
    score: totalScore,
    hasFlags: data.flags.length > 0
  }))

  // If compliance flags present, escalate to Compliance Officer
  if (data.flags.length > 0) {
    await notifyComplianceOfficer(review, data.flags)
  }

  return review
}
```

#### 12.4 QA Review UI

Key components for the QA analyst view:

```
┌──────────────────────────────────────────────────────────────┐
│  QA REVIEW: CASE-00042                          [Submit]     │
├──────────────────────────────────────────────────────────────┤
│  ▶ 00:00 ────────────────────────────── 04:32    [Pause]    │
│  Agent: John Smith  |  Customer: Jane Doe  |  Duration: 4m  │
├──────────────────────────────────────────────────────────────┤
│  SCORING RUBRIC                                              │
│                                                              │
│  Professional Opening                              /10       │
│  ● Used proper greeting     [ 0 | 1 | 2 | 3 | 4 | 5 ]      │
│  ● Verified customer ID     [ 0 | 1 | 2 | 3 | 4 | 5 ]      │
│                                                              │
│  Problem Resolution                               /40       │
│  ● Understood the issue     [slider 0-10]                   │
│  ...                                                         │
├──────────────────────────────────────────────────────────────┤
│  COMPLIANCE FLAGS          COACHING NOTES                    │
│  ☑ Recording disclosure    [text area for coach notes...]   │
│  ☐ PCI DTMF pause          ....                             │
└──────────────────────────────────────────────────────────────┘
```

### Deliverables
- [ ] QA queue shows all unreviewed resolved/closed cases with recordings
- [ ] Call playback works in QA review UI with access logged
- [ ] Score rubric calculates weighted total correctly
- [ ] Compliance flags notify Compliance Officer via Socket.io
- [ ] Agent receives real-time notification of completed review
- [ ] Review stored in `qa_reviews` with full audit trail

---

## Week 13 — Compliance & Audit Module

### Objectives
Build the Compliance Officer interface: immutable audit log viewer, access history, and tamper-evident signed PDF export. Compliance officers cannot edit anything — read and export only.

### Tasks

#### 13.1 Audit Log Viewer

The audit log must be:
- **Immutable** — no UPDATE or DELETE ever permitted on `audit_logs`
- **Complete** — every read, write, export, and playback is logged
- **Exportable** — signed PDF bundles for regulatory submission

```typescript
// GET /api/v1/audit/logs
// Only accessible by COMPLIANCE_OFFICER or ADMIN
// Filters: actorId, resourceType, action, dateFrom, dateTo

async getAuditLogs(filters: AuditFilters, page: number) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.actorId      && { actorId: filters.actorId }),
      ...(filters.resourceType && { resourceType: filters.resourceType }),
      ...(filters.action       && { action: filters.action }),
      ...(filters.dateFrom && filters.dateTo && {
        createdAt: { gte: filters.dateFrom, lte: filters.dateTo }
      })
    },
    orderBy: { createdAt: 'desc' },
    skip: page * 100,
    take: 100
  })
}

// This access itself is logged
// Middleware automatically records every GET /audit/logs access
```

#### 13.2 Append-Only Enforcement

Enforce immutability at the database level:

```sql
-- Migration: make audit_logs append-only via trigger
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

Also enforce in Prisma: never call `prisma.auditLog.update()` or `.delete()`. Add a lint rule.

#### 13.3 Signed PDF Export

```typescript
// POST /api/v1/audit/export
// Body: { dateFrom, dateTo, actorId?, resourceType?, format: 'pdf' | 'csv' }

import PDFDocument from 'pdfkit'
import crypto from 'crypto'

async exportAuditTrail(filters: ExportFilters, requestorId: string): Promise<Buffer> {
  const logs = await getAuditLogs(filters, 0)  // Get all (no pagination for export)

  // Generate PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const buffers: Buffer[] = []
  doc.on('data', chunk => buffers.push(chunk))

  // Header
  doc.fontSize(18).text('CCMP Audit Trail Export', { align: 'center' })
  doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`)
  doc.text(`Exported by: ${requestorId}`)
  doc.text(`Date range: ${filters.dateFrom} → ${filters.dateTo}`)
  doc.text(`Total records: ${logs.length}`)
  doc.moveDown()

  // Table of entries
  for (const log of logs) {
    doc.fontSize(9).text(
      `${log.createdAt.toISOString()} | ${log.actorEmail} | ${log.action} | ${log.resourceType}:${log.resourceId} | IP:${log.ipAddress}`
    )
  }

  doc.end()

  const pdfBuffer = Buffer.concat(buffers)

  // Sign the PDF with server private key for tamper-evidence
  const sign = crypto.createSign('SHA256')
  sign.update(pdfBuffer)
  const signature = sign.sign(process.env.AUDIT_EXPORT_PRIVATE_KEY, 'base64')

  // Append signature as metadata (embeds in PDF XMP)
  const signedPdf = await embedSignatureInPdf(pdfBuffer, signature)

  // Log the export itself
  await prisma.auditLog.create({
    data: {
      actorId:      requestorId,
      resourceType: 'audit_log',
      resourceId:   'export',
      action:       'exported',
      metadata:     { recordCount: logs.length, dateFrom: filters.dateFrom, dateTo: filters.dateTo }
    }
  })

  return signedPdf
}
```

#### 13.4 Access History UI

The Compliance Officer can look up a specific user's full activity:

```typescript
// GET /api/v1/audit/access-history/:userId

async getUserAccessHistory(subjectUserId: string) {
  return prisma.auditLog.findMany({
    where: { actorId: subjectUserId },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: {
      id: true,
      action: true,
      resourceType: true,
      resourceId: true,
      ipAddress: true,
      sessionId: true,
      createdAt: true
    }
  })
}
```

### Deliverables
- [ ] Audit log viewer accessible only to COMPLIANCE_OFFICER / ADMIN
- [ ] Database trigger prevents any UPDATE/DELETE on `audit_logs`
- [ ] Every audit log access is itself logged (recursion-safe)
- [ ] PDF export generates correctly with all records
- [ ] Signature can be verified externally with public key
- [ ] CSV export option available for spreadsheet analysis

---

## Week 14 — Reporting & Analytics

### Objectives
Build the reporting module for Operations Managers. All reports are server-computed from Postgres (read replica). Results stream to the client for large exports.

### Report Catalogue

| Report | Description | Key Metric |
|---|---|---|
| Average Handling Time | Mean duration per case/agent/queue | AHT per channel |
| SLA Breach Rate | % of cases that breached SLA | Breach % per priority |
| First Call Resolution | % resolved on first interaction | FCR % per queue |
| Agent Performance | Score, AHT, FCR, CSAT per agent | Composite score |
| Queue Backlog | Open cases per queue over time | Queue depth trend |
| Customer Satisfaction | CSAT score distribution | Net CSAT % |
| Case Volume | Cases created/resolved per period | Volume trend |

### Tasks

#### 14.1 Report Queries (Read Replica)

```typescript
// apps/api/src/modules/reports/reports.service.ts
// All queries use prisma.$queryRaw against read replica connection

async getAhtReport(from: Date, to: Date, groupBy: 'agent' | 'queue' | 'channel') {
  return prisma.$queryRaw`
    SELECT
      ${groupBy === 'agent'   ? sql`u.display_name AS group_label` :
        groupBy === 'queue'   ? sql`q.name AS group_label` :
                                sql`c.channel AS group_label`},
      COUNT(c.id) AS total_cases,
      AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))) AS avg_handling_time_sec,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))) AS median_handling_time_sec,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))) AS p95_handling_time_sec
    FROM cases c
    LEFT JOIN users u ON c.assigned_to = u.id
    LEFT JOIN queues q ON c.queue_id = q.id
    WHERE c.created_at BETWEEN ${from} AND ${to}
      AND c.resolved_at IS NOT NULL
      AND c.deleted_at IS NULL
    GROUP BY group_label
    ORDER BY avg_handling_time_sec DESC
  `
}

async getSlaBreachReport(from: Date, to: Date) {
  return prisma.$queryRaw`
    SELECT
      c.priority,
      c.channel,
      COUNT(*) FILTER (WHERE c.sla_due_at IS NOT NULL) AS total_with_sla,
      COUNT(*) FILTER (WHERE c.resolved_at > c.sla_due_at OR (c.resolved_at IS NULL AND c.sla_due_at < NOW())) AS breached,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE c.resolved_at > c.sla_due_at OR (c.resolved_at IS NULL AND c.sla_due_at < NOW()))
        / NULLIF(COUNT(*) FILTER (WHERE c.sla_due_at IS NOT NULL), 0),
        2
      ) AS breach_rate_pct
    FROM cases c
    WHERE c.created_at BETWEEN ${from} AND ${to}
      AND c.deleted_at IS NULL
    GROUP BY c.priority, c.channel
    ORDER BY breach_rate_pct DESC
  `
}

async getAgentPerformanceReport(from: Date, to: Date) {
  return prisma.$queryRaw`
    SELECT
      u.id AS agent_id,
      u.display_name,
      COUNT(DISTINCT c.id) AS total_cases,
      AVG(qr.score) AS avg_qa_score,
      AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))) AS avg_handling_time_sec,
      COUNT(DISTINCT c.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM case_events ce
          WHERE ce.case_id = c.id AND ce.event_type = 'case.created'
          AND c.resolved_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM case_events ce2
            WHERE ce2.case_id = c.id AND ce2.event_type = 'case.reassigned'
          )
        )
      ) AS first_contact_resolutions
    FROM users u
    LEFT JOIN cases c ON c.assigned_to = u.id AND c.created_at BETWEEN ${from} AND ${to}
    LEFT JOIN qa_reviews qr ON qr.agent_id = u.id
    WHERE u.role IN ('AGENT', 'SENIOR_AGENT')
      AND u.deleted_at IS NULL
    GROUP BY u.id, u.display_name
    ORDER BY avg_qa_score DESC NULLS LAST
  `
}
```

#### 14.2 Streaming CSV Export

For large reports, stream results to avoid memory exhaustion:

```typescript
// apps/api/src/modules/reports/reports.router.ts
import { Router } from 'express'
import { stringify } from 'csv-stringify'
import { requireRole } from '../../middleware/auth'
import { getReportCursor } from './reports.service'

const router = Router()
const REPORT_ROLES = ['OPERATIONS_MANAGER', 'SUPERVISOR', 'ADMIN']

// GET /api/v1/reports/export?type=agent_performance&from=...&to=...&format=csv
router.get('/export', requireRole(REPORT_ROLES), async (req, res) => {
  const { type, from, to } = req.query as Record<string, string>

  // Express res is a writable stream — pipe directly into it
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${type}_${from}_${to}.csv"`)

  const cursor    = getReportCursor(type, new Date(from), new Date(to))
  const csvStream = stringify({ header: true })
  csvStream.pipe(res)   // pipe to response; Express handles backpressure automatically

  for await (const row of cursor) {
    csvStream.write(row)
  }
  csvStream.end()
})

export { router as reportsRouter }
```

#### 14.3 Recharts Dashboard (Frontend)

```tsx
// apps/web/src/app/(dashboard)/reports/page.tsx

import { LineChart, BarChart, PieChart, Line, Bar, Pie } from 'recharts'

export default function ReportsDashboard() {
  const { data: slaData }   = useQuery({ queryKey: ['reports', 'sla'],   queryFn: fetchSlaReport })
  const { data: ahtData }   = useQuery({ queryKey: ['reports', 'aht'],   queryFn: fetchAhtReport })
  const { data: csatData }  = useQuery({ queryKey: ['reports', 'csat'],  queryFn: fetchCsatReport })

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* SLA Breach Rate by Priority */}
      <ReportCard title="SLA Breach Rate">
        <BarChart data={slaData}>
          <Bar dataKey="breach_rate_pct" fill="#E53E3E" name="Breach %" />
        </BarChart>
      </ReportCard>

      {/* Avg Handling Time Trend */}
      <ReportCard title="Avg Handling Time (7 days)">
        <LineChart data={ahtData}>
          <Line type="monotone" dataKey="avg_handling_time_sec" stroke="#3182CE" />
        </LineChart>
      </ReportCard>

      {/* CSAT Distribution */}
      <ReportCard title="Customer Satisfaction">
        <PieChart>
          <Pie data={csatData} dataKey="count" nameKey="rating" />
        </PieChart>
      </ReportCard>
    </div>
  )
}
```

### Deliverables
- [ ] All 7 reports queryable via API
- [ ] Reports query Postgres read replica (not primary)
- [ ] CSV streaming export works for 100k+ row datasets
- [ ] Recharts dashboards render with real data
- [ ] Operations Manager can export weekly PDF summary
- [ ] Report access is logged in audit trail

---

## Week 15 — CSAT Survey System

### Objectives
Automatically trigger customer satisfaction surveys 15 minutes after case closure. Collect ratings and free-text feedback. Aggregate results in reports.

### Tasks

#### 15.1 CSAT Trigger Job

```typescript
// Triggered 15 minutes after case status transitions to CLOSED

// In case.service.ts — transitionStatus handler:
if (newStatus === 'CLOSED') {
  await csatQueue.add(
    'send_csat_survey',
    { caseId, customerEmail: caseRecord.customerEmail },
    {
      delay: 15 * 60 * 1000,  // 15 minutes
      jobId: `csat:${caseId}`,
      removeOnComplete: true
    }
  )
}

// Worker processor:
csatWorker.process('send_csat_survey', async (job) => {
  const { caseId, customerEmail } = job.data
  if (!customerEmail) return  // Skip if no email

  const token = generateCsatToken(caseId)  // JWT with 7-day expiry
  const surveyUrl = `${process.env.BASE_URL}/survey/${token}`

  await emailService.send({
    to: customerEmail,
    subject: 'How did we do? — Quick 30-second survey',
    template: 'csat_survey',
    variables: { surveyUrl, caseNumber: caseRecord.caseNumber }
  })
})
```

#### 15.2 CSAT Survey Table

Add to Prisma schema:

```prisma
model CsatResponse {
  id          String   @id @default(cuid())
  caseId      String   @unique @map("case_id")
  rating      Int      // 1–5
  feedback    String?
  channel     String   // email, sms, web
  respondedAt DateTime @default(now()) @map("responded_at")

  @@index([caseId])
  @@index([respondedAt])
  @@map("csat_responses")
}
```

#### 15.3 Survey Response API

```typescript
// POST /api/v1/survey/respond — Public endpoint (no auth required)
// Token is JWT containing caseId, validated server-side

async submitCsatResponse(token: string, rating: number, feedback?: string) {
  const { caseId } = verifyCsatToken(token)  // Throws if expired or invalid

  // Idempotent — can only respond once
  const existing = await prisma.csatResponse.findUnique({ where: { caseId } })
  if (existing) return { alreadySubmitted: true }

  await prisma.csatResponse.create({
    data: { caseId, rating, feedback, channel: 'email' }
  })

  return { submitted: true }
}
```

### Deliverables
- [ ] CSAT job fires 15 minutes after case closes
- [ ] Survey email sent with tokenized link
- [ ] One-click rating (1–5) works on mobile
- [ ] Responses stored and appear in CSAT report within 1 hour
- [ ] Survey token expires after 7 days

---

## Week 16 — Knowledge Base

### Objectives
Build a searchable internal knowledge base that agents can reference while handling cases. Articles are authored by supervisors/admins and searched from the agent desktop mid-call.

### Tasks

#### 16.1 Knowledge Base Schema

```prisma
model KbArticle {
  id          String   @id @default(cuid())
  title       String
  content     String   // Markdown
  tags        String[] @default([])
  category    String
  authorId    String   @map("author_id")
  isPublished Boolean  @default(false) @map("is_published")
  viewCount   Int      @default(0) @map("view_count")
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([category])
  @@map("kb_articles")
}
```

#### 16.2 KB Search via Meilisearch

```typescript
// Index KB articles alongside cases
await meili.index('kb_articles').updateSettings({
  searchableAttributes: ['title', 'content', 'tags', 'category'],
  filterableAttributes: ['category', 'isPublished'],
})

// GET /api/v1/kb/search?q=billing+refund&category=billing
async searchKb(query: string, category?: string) {
  return meili.index('kb_articles').search(query, {
    filter: ['isPublished = true', ...(category ? [`category = ${category}`] : [])],
    limit: 10,
    attributesToSnippet: ['content:50']  // Show content excerpt
  })
}
```

#### 16.3 Agent Desktop Integration

Add a slide-out panel in the agent desktop that agents can open mid-call:

```tsx
// "Search knowledge base" button opens right sidebar
// Auto-suggests articles based on case subject + tags
const suggestedArticles = useQuery({
  queryKey: ['kb', case.subject, case.tags],
  queryFn: () => searchKb(case.subject),
  enabled: !!case.subject
})
```

### Deliverables
- [ ] Knowledge base CRUD API for admins/supervisors
- [ ] KB articles indexed in Meilisearch
- [ ] Agent desktop shows KB search panel
- [ ] Auto-suggestion based on case context works
- [ ] View count tracked per article

---

## Week 17 — Observability Stack & Phase Hardening

### Objectives
Stand up the full Grafana + Prometheus + Loki observability stack. Add structured logging with PII scrubbing. Instrument all services with OpenTelemetry. Fix all Phase 3 bugs.

### Tasks

#### 17.1 Prometheus Metrics

```typescript
// apps/api/src/plugins/metrics.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client'

export const metrics = {
  httpRequestDuration: new Histogram({
    name: 'ccmp_http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status_code']
  }),
  casesCreated: new Counter({
    name: 'ccmp_cases_created_total',
    help: 'Total cases created',
    labelNames: ['channel', 'priority']
  }),
  slaBreaches: new Counter({
    name: 'ccmp_sla_breaches_total',
    help: 'Total SLA breaches',
    labelNames: ['priority', 'queue']
  }),
  activeAgents: new Gauge({
    name: 'ccmp_active_agents',
    help: 'Currently online agents',
    labelNames: ['team']
  }),
  queueDepth: new Gauge({
    name: 'ccmp_queue_depth',
    help: 'Cases waiting in queue',
    labelNames: ['queue_name']
  }),
  bullmqQueueLength: new Gauge({
    name: 'ccmp_bullmq_queue_length',
    help: 'BullMQ job queue depth',
    labelNames: ['queue_name']
  })
}

// Expose /metrics endpoint for Prometheus scraping (Express.js)
// Register in app.ts: app.use(metricsRouter)
const metricsRouter = require('express').Router()
metricsRouter.get('/metrics', async (_req: any, res: any) => {
  res.setHeader('Content-Type', register.contentType)
  res.send(await register.metrics())
})
```

#### 17.2 Structured Logging with PII Scrubbing

```typescript
// packages/shared/src/logger.ts
import pino from 'pino'

const PII_PATTERNS = [
  { pattern: /\b[\w.]+@[\w.]+\.\w+\b/g,       replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: '[CARD_REDACTED]' },
  { pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g,        replacement: '[SSN_REDACTED]' }
]

function redactPii(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return PII_PATTERNS.reduce((str, { pattern, replacement }) =>
      str.replace(pattern, replacement), obj)
  }
  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, redactPii(v)])
    )
  }
  return obj
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    req: (req) => redactPii({
      method: req.method, url: req.url, headers: { 'user-agent': req.headers['user-agent'] }
    }),
    res: (res) => ({ statusCode: res.statusCode })
  }
})
```

#### 17.3 Grafana Dashboards

Add to `docker-compose.yml` observability services:

```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus

grafana:
  image: grafana/grafana:latest
  environment:
    GF_AUTH_GENERIC_OAUTH_ENABLED: "true"
    GF_AUTH_GENERIC_OAUTH_CLIENT_ID: grafana
    # Keycloak SSO for Grafana login
  volumes:
    - grafana_data:/var/lib/grafana
    - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards

loki:
  image: grafana/loki:latest
  volumes:
    - loki_data:/loki
    - ./config/loki/loki.yml:/etc/loki/local-config.yaml

promtail:
  image: grafana/promtail:latest
  volumes:
    - /var/log:/var/log:ro
    - ./config/promtail/promtail.yml:/etc/promtail/config.yml
```

Provision these dashboards via JSON in `config/grafana/dashboards/`:
- `ccmp-operations.json` — case volume, SLA breaches, queue depths
- `ccmp-agents.json` — agent activity, AHT, presence distribution
- `ccmp-infra.json` — CPU, memory, Postgres connections, Redis memory
- `ccmp-sla.json` — SLA heatmap, breach timeline, escalation rate

### Deliverables
- [ ] Prometheus scrapes all services successfully
- [ ] All 4 Grafana dashboards provisioned and populating
- [ ] Loki aggregating logs from all services
- [ ] PII scrubber verified: no email/card/phone in log output
- [ ] OpenTelemetry traces visible in Grafana Tempo
- [ ] P95 latency alert fires if API exceeds 500ms

---

## Phase 3 Definition of Done

| Check | Criteria |
|---|---|
| ✅ QA Module | Analyst completes full review; flags notify compliance; agent notified |
| ✅ Compliance | Immutable audit log; append-only enforced at DB level; signed PDF export |
| ✅ Reports | All 7 reports queryable; CSV streaming; read replica used |
| ✅ CSAT | Survey fires 15 min after close; results in reports |
| ✅ Knowledge Base | Articles indexed; agent desktop search works |
| ✅ Observability | Grafana live; Loki ingesting; PII scrubbed; alerts configured |

---

## Phase 3 → Phase 4 Handoff Checklist

- [ ] Compliance officer has reviewed and signed off on audit log immutability proof
- [ ] Operations manager has validated all 7 reports with real data
- [ ] Grafana alert channels configured (Slack or email)
- [ ] ADR-003 written: Reporting architecture (server-side SQL vs BI tool)
- [ ] CSAT survey email tested end-to-end with real email provider
- [ ] Knowledge base seeded with at least 20 real articles

---

*Phase 3 of 5 · CCMP Implementation Roadmap · Prev: [Phase 2](./Phase-2_Core-Operations.md) · Next: [Phase 4 — Scalability & Performance](./Phase-4_Scalability-and-Performance.md)*

---

## 🔍 Requirements Audit — Phase 3

### Gap Analysis

| ID | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| G3-01 | 🔴 Critical | §12.1/12.3 | QA service methods defined but **no Express router** provided | **Missing** — Add `qa.router.ts` (see fix below) |
| G3-02 | 🔴 Critical | §13.1/13.3 | Audit service defined but **no Express router** provided | **Missing** — Add `audit.router.ts` (see fix below) |
| G3-03 | 🔴 Critical | §15.3 | CSAT survey submission is a **public endpoint** — no router definition provided | **Missing** — Add `survey.router.ts` with no-auth route |
| G3-04 | 🔴 Critical | §16.2 | KB search function defined but no HTTP route wires it | **Missing** — Add `kb.router.ts` |
| G3-05 | 🟡 Important | §15.2 | `CsatResponse` model added to schema in §15.2 but requires a **new migration** — not mentioned | **Flag** — Run `pnpm prisma migrate dev --name add_csat_kb` after also adding `KbArticle` |
| G3-06 | 🟡 Important | §17.3 | Grafana dashboard JSON files referenced but no content or provisioning config provided | **Missing** — Add `config/grafana/provisioning/dashboards/dashboards.yml` |

**Actionable fix for G3-01 — QA router:**
```typescript
// apps/api/src/modules/qa/qa.router.ts
import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { QaService } from './qa.service'

const router  = Router()
const service = new QaService()

router.get ('/queue',   requireRole(['QA_ANALYST','ADMIN']), async (req, res) => {
  res.json(await service.getQaQueue(req.user!.id, req.query as any))
})
router.post('/reviews', requireRole(['QA_ANALYST','ADMIN']), async (req, res) => {
  const review = await service.createQaReview(req.body, req.user!.id)
  res.status(201).json(review)
})
router.get ('/reviews/:caseId', requireRole(['QA_ANALYST','SUPERVISOR','ADMIN']), async (req, res) => {
  res.json(await service.getReviewsForCase(req.params.caseId))
})

export { router as qaRouter }
```

**Actionable fix for G3-02 — Audit router:**
```typescript
// apps/api/src/modules/audit/audit.router.ts
import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { AuditService } from './audit.service'

const router  = Router()
const service = new AuditService()
const ROLES   = ['COMPLIANCE_OFFICER','ADMIN']

router.get ('/logs',                requireRole(ROLES), async (req, res) => {
  const logs = await service.getAuditLogs(req.query as any, Number(req.query.page ?? 0))
  // Log this access itself
  await service.logAccess(req.user!.id, req.user!.email, req.ip, 'audit_log_viewed')
  res.json(logs)
})
router.get ('/access-history/:uid', requireRole(ROLES), async (req, res) => {
  res.json(await service.getUserAccessHistory(req.params.uid))
})
router.post('/export',              requireRole(ROLES), async (req, res) => {
  const pdf = await service.exportAuditTrail(req.body, req.user!.id)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename="audit-export.pdf"')
  res.send(pdf)
})

export { router as auditRouter }
```

**Actionable fix for G3-03 — Public CSAT survey router:**
```typescript
// apps/api/src/modules/csat/survey.router.ts
import { Router } from 'express'
import { CsatService } from './csat.service'

const router  = Router()  // No auth — public endpoint
const service = new CsatService()

router.get ('/:token',  async (req, res) => {
  try {
    const info = service.verifyCsatToken(req.params.token)
    res.json({ valid: true, caseId: info.caseId })
  } catch { res.status(400).json({ valid: false, error: 'Token expired or invalid' }) }
})
router.post('/respond', async (req, res) => {
  const result = await service.submitCsatResponse(
    req.body.token, req.body.rating, req.body.feedback
  )
  res.json(result)
})

export { router as surveyRouter }
// Mount in app.ts: app.use('/api/v1/survey', surveyRouter)
```

---

## ✅ Phase 3 — Requirement Re-Verification Prompt

> **Instructions:** All items must be verified before Phase 4 begins.

| # | Requirement | Verification Method | Pass? |
|---|---|---|---|
| 1 | QA queue returns only unreviewed resolved/closed cases with recordings | `GET /qa/queue?unreviewed=true` — verify no open or no-recording cases in response | ☐ |
| 2 | QA weighted score calculates correctly | Submit known item scores; verify total = weighted sum formula | ☐ |
| 3 | Compliance flags notify Compliance Officer via Socket.IO | Submit review with flag; verify CO socket receives `qa:compliance_flag` event | ☐ |
| 4 | Agent notified of completed QA review | Submit review; verify agent socket receives `qa:review_completed` event | ☐ |
| 5 | DB trigger prevents UPDATE on `audit_logs` | `UPDATE audit_logs SET action='tampered' WHERE id=X` → Postgres raises exception | ☐ |
| 6 | DB trigger prevents DELETE on `audit_logs` | `DELETE FROM audit_logs WHERE id=X` → Postgres raises exception | ☐ |
| 7 | Audit log access is itself logged | `GET /audit/logs`; then query DB for `action=audit_log_viewed` row | ☐ |
| 8 | COMPLIANCE_OFFICER can view audit logs | CO token → `GET /audit/logs` → 200 with data | ☐ |
| 9 | AGENT role returns 403 on audit logs | AGENT token → `GET /audit/logs` → 403 | ☐ |
| 10 | PDF export generates with correct record count | `POST /audit/export` with 1-week range → PDF row count matches DB query | ☐ |
| 11 | PDF signature verifiable with public key | `openssl dgst -sha256 -verify public.pem -signature sig.bin export.pdf` → Verified OK | ☐ |
| 12 | All 7 reports return data (not 500) | Hit each report endpoint with valid date range → all return 200 | ☐ |
| 13 | Reports use read replica (not primary) | Check `pg_stat_activity` on replica during report call — activity present | ☐ |
| 14 | CSV streaming works for large dataset without OOM | Export 100k+ rows; watch `docker stats api` — memory stays flat | ☐ |
| 15 | CSAT job fires 15 min after case closes | Close case; check BullMQ — `csat:${id}` job has ~900s delay | ☐ |
| 16 | CSAT token expires after 7 days | Forge expired token; `POST /survey/respond` → 400 invalid token | ☐ |
| 17 | CSAT one-time response enforced | Submit twice; second returns `{ alreadySubmitted: true }` | ☐ |
| 18 | KB search returns results in < 200ms | `k6 run kb-search.js` → p95 < 200ms | ☐ |
| 19 | KB search filtered to published articles only | Search for draft article title → 0 hits | ☐ |
| 20 | Prometheus scrapes all services | `curl http://localhost:9090/targets` → all targets in `UP` state | ☐ |
| 21 | PII audit script reports zero matches | `./scripts/pii-audit.sh` → `✅ PASS: No PII found in logs` | ☐ |
| 22 | All 4 Grafana dashboards populate with data | Open each dashboard → no "No data" panels | ☐ |
| 23 | `CsatResponse` and `KbArticle` migrations applied | `pnpm prisma migrate deploy` → exits 0; both tables exist in DB | ☐ |
| 24 | ADR-003 committed | `docs/adr/003-reporting.md` exists in repo | ☐ |

---
*Phase 3 of 5 · CCMP Implementation Roadmap · Express.js migration applied · Requirements audit complete*
