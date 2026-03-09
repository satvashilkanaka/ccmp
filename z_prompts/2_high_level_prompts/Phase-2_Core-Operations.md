# Phase 2 — Core Operations
### CCMP Implementation Roadmap · Weeks 6–11

> **Goal:** Bring the platform to life operationally. By the end of this phase, agents are handling real calls in the browser, SLA countdowns are running, supervisors can monitor live queues, and call recordings are encrypted and stored. This is where the platform becomes a real contact center tool.

---

## Overview

| Attribute | Value |
|---|---|
| **Duration** | 6 Weeks |
| **Team Focus** | Full team — all 5 engineers active |
| **Primary Output** | SLA engine, telephony integration, supervisor dashboard, recordings |
| **Depends On** | Phase 1 complete and all handoff checklist items verified |
| **Success Gate** | Agent answers inbound call in browser; SLA breach fires escalation within 60 seconds |

---

## Week 6 — SLA Engine

### Objectives
Build the SLA monitoring system using BullMQ delayed jobs. Every case assignment triggers a countdown. At 80% elapsed time, a warning fires. At 100%, the escalation chain is triggered automatically.

### Architecture

```
Case Assigned
     │
     ▼
SLA Service: calculate sla_due_at
     │
     ├──► BullMQ: sla_warning job  (delayed to 80% of SLA window)
     └──► BullMQ: sla_breach job   (delayed to 100% of SLA window)
              │
              ▼
         SLA Breached?
              │
              ├──► Publish sla:breached to Redis pub/sub
              ├──► Escalate case (Agent → Senior Agent → Supervisor → Manager)
              └──► Audit log: "sla_breach" event
```

### Tasks

#### 6.1 SLA Policy Lookup

```typescript
// apps/api/src/modules/sla/sla.service.ts

export class SlaService {
  async attachSlaToCase(caseId: string, priority: CasePriority, channel: CaseChannel) {
    // Find most specific policy (priority + channel), fall back to priority-only
    const policy = await prisma.slaPolicy.findFirst({
      where: {
        priority,
        isActive: true,
        OR: [{ channel }, { channel: null }]
      },
      orderBy: { channel: 'desc' }  // Specific (with channel) wins over generic
    })

    if (!policy) throw new Error(`No SLA policy for ${priority}/${channel}`)

    const now = new Date()
    const firstResponseDue = new Date(now.getTime() + policy.firstResponseSec * 1000)
    const resolutionDue    = new Date(now.getTime() + policy.resolutionSec * 1000)

    await prisma.case.update({
      where: { id: caseId },
      data: {
        slaPolicy: policy.id,
        slaFirstResponseAt: firstResponseDue,
        slaDueAt: resolutionDue
      }
    })

    // Schedule BullMQ jobs
    await this.scheduleWarning(caseId, policy)
    await this.scheduleBreach(caseId, resolutionDue)
  }

  private async scheduleWarning(caseId: string, policy: SlaPolicy) {
    const warningDelayMs = policy.resolutionSec * 1000 * policy.warningThreshold
    await slaQueue.add('sla_warning', { caseId }, {
      delay: warningDelayMs,
      jobId: `sla_warning:${caseId}`,  // Idempotent — prevents duplicates
      removeOnComplete: true
    })
  }

  private async scheduleBreach(caseId: string, dueAt: Date) {
    const delayMs = dueAt.getTime() - Date.now()
    await slaQueue.add('sla_breach', { caseId }, {
      delay: Math.max(0, delayMs),
      jobId: `sla_breach:${caseId}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    })
  }

  async cancelSlaJobs(caseId: string) {
    // Called when case is resolved/closed — cancel pending jobs
    const warningJob = await slaQueue.getJob(`sla_warning:${caseId}`)
    const breachJob  = await slaQueue.getJob(`sla_breach:${caseId}`)
    await warningJob?.remove()
    await breachJob?.remove()
  }
}
```

#### 6.2 BullMQ Job Processors

```typescript
// workers/src/processors/sla.processor.ts
import { Worker } from 'bullmq'

const slaWorker = new Worker('sla', async (job) => {
  const { caseId } = job.data

  if (job.name === 'sla_warning') {
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } })
    if (!caseRecord || ['RESOLVED','CLOSED'].includes(caseRecord.status)) return

    // Real-time warning to agent and supervisor
    await redis.publish('sla:warning', JSON.stringify({
      caseId,
      caseNumber: caseRecord.caseNumber,
      agentId: caseRecord.assignedTo,
      slaDueAt: caseRecord.slaDueAt,
      priority: caseRecord.priority
    }))
  }

  if (job.name === 'sla_breach') {
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } })
    if (!caseRecord || ['RESOLVED','CLOSED'].includes(caseRecord.status)) return

    // Trigger escalation chain
    await escalateSlaBreachCase(caseId, caseRecord)

    // Audit log
    await prisma.auditLog.create({
      data: {
        resourceType: 'case',
        resourceId: caseId,
        action: 'sla_breach',
        metadata: {
          priority: caseRecord.priority,
          slaDueAt: caseRecord.slaDueAt,
          breachedAt: new Date()
        }
      }
    })
  }
}, {
  connection: redis,
  concurrency: 20  // Process up to 20 SLA events simultaneously
})
```

#### 6.3 Escalation Chain

```typescript
const ESCALATION_CHAIN: UserRole[] = [
  'SENIOR_AGENT',
  'SUPERVISOR',
  'OPERATIONS_MANAGER'
]

async function escalateSlaBreachCase(caseId: string, caseRecord: Case) {
  // Find next role in chain above current assignee
  const currentAgentRole = await getUserRole(caseRecord.assignedTo)
  const nextRoleIndex = ESCALATION_CHAIN.indexOf(currentAgentRole) + 1

  if (nextRoleIndex >= ESCALATION_CHAIN.length) {
    // Already at the top — notify but cannot escalate further
    await notifyOperationsManager(caseId, 'escalation_ceiling_reached')
    return
  }

  const nextRole = ESCALATION_CHAIN[nextRoleIndex]
  const nextAgent = await findAvailableAgentByRole(nextRole, caseRecord.queueId)

  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: 'ESCALATED',
      assignedTo: nextAgent?.id,
      version: { increment: 1 },
      events: {
        create: {
          eventType: 'sla.escalated',
          payload: { reason: 'sla_breach', escalatedTo: nextRole, nextAgentId: nextAgent?.id }
        }
      }
    }
  })

  await redis.publish('case:status_changed', JSON.stringify({
    caseId, to: 'ESCALATED', reason: 'sla_breach'
  }))
}
```

#### 6.4 SLA Heatmap Data API

```typescript
// GET /api/v1/sla/heatmap
// Returns agent × case grid with SLA status colors

type SlaStatus = 'OK' | 'WARNING' | 'BREACHED'

async getSlaHeatmap(teamId: string): Promise<HeatmapData> {
  const cases = await prisma.case.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      agent: { teamId }
    },
    select: { id: true, caseNumber: true, assignedTo: true, slaDueAt: true, priority: true }
  })

  return cases.map(c => {
    const remaining = c.slaDueAt ? c.slaDueAt.getTime() - Date.now() : null
    const policyDuration = SLA_DURATIONS[c.priority]
    const pct = remaining != null ? remaining / policyDuration : null

    return {
      ...c,
      slaStatus: pct == null ? 'OK'
        : pct < 0      ? 'BREACHED'
        : pct < 0.2    ? 'WARNING'
        : 'OK'
    }
  })
}
```

### Deliverables
- [ ] SLA policies seeded for all priority levels
- [ ] Case assignment triggers BullMQ warning + breach jobs
- [ ] Warning fires at 80% elapsed via Socket.io to agent desktop
- [ ] Breach fires escalation chain and creates `sla.escalated` event
- [ ] Resolved/closed cases cancel pending SLA jobs
- [ ] SLA heatmap API returns correct status per case

---

## Week 7 — FreeSWITCH & WebRTC Telephony

### Objectives
Integrate FreeSWITCH for inbound call handling. Agents answer calls directly in the browser using WebRTC (SIP.js). Every call automatically creates or updates a case.

### Architecture

```
Inbound Call
     │
     ▼
FreeSWITCH (SIP/PBX)
     │
     ├──► ESL Event Socket → Telephony Adapter (Node.js)
     │         │
     │         ├──► Create/update Case in DB
     │         ├──► Publish call:incoming to Redis
     │         └──► Store CDR on call end
     │
     └──► WebRTC Gateway (WSS)
              │
              ▼
         Agent Browser (SIP.js)
         ← Audio stream via WebRTC
```

### Tasks

#### 7.1 FreeSWITCH Docker Service

Add to `docker-compose.yml`:

```yaml
freeswitch:
  image: signalwire/freeswitch:v1.10
  network_mode: host  # Required for RTP media streams
  environment:
    FREESWITCH_PASSWORD: ${FREESWITCH_ESL_PASSWORD}
  volumes:
    - ./config/freeswitch/conf:/etc/freeswitch
    - freeswitch_recordings:/var/lib/freeswitch/recordings
  healthcheck:
    test: ["CMD", "fs_cli", "-x", "status"]
    interval: 30s
```

#### 7.2 FreeSWITCH Dialplan (inbound route)

```xml
<!-- config/freeswitch/conf/dialplan/default.xml -->
<extension name="ccmp_inbound">
  <condition field="destination_number" expression="^(1[0-9]{10})$">
    <!-- Set variables for routing -->
    <action application="set" data="ccmp_dnis=${destination_number}"/>
    <action application="set" data="ccmp_ani=${caller_id_number}"/>
    
    <!-- Record the call (DTMF pause support for PCI) -->
    <action application="set" data="RECORD_STEREO=true"/>
    <action application="set" data="recording_follow_transfer=true"/>
    <action application="record_session" data="/var/lib/freeswitch/recordings/${uuid}.wav"/>
    
    <!-- Bridge to CCMP routing engine via ESL -->
    <action application="socket" data="localhost:8084 async full"/>
  </condition>
</extension>
```

#### 7.3 ESL Event Socket Listener (Telephony Adapter)

```typescript
// apps/api/src/modules/telephony/esl.adapter.ts
import { Connection } from 'modesl'

export class EslAdapter {
  private conn: Connection

  async connect() {
    this.conn = new Connection(
      process.env.FREESWITCH_HOST,
      8021,
      process.env.FREESWITCH_ESL_PASSWORD
    )

    this.conn.on('esl::event::CHANNEL_ANSWER::*', this.onCallAnswered.bind(this))
    this.conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::*', this.onCallEnded.bind(this))
    this.conn.on('esl::event::RECORD_START::*', this.onRecordingStart.bind(this))
    this.conn.on('esl::event::RECORD_STOP::*', this.onRecordingStop.bind(this))
  }

  private async onCallAnswered(event: any) {
    const uuid = event.getHeader('Unique-ID')
    const ani  = event.getHeader('Caller-ANI')  // Caller phone number
    const dnis = event.getHeader('Caller-Destination-Number')
    const agentId = event.getHeader('variable_ccmp_agent_id')

    // Create a new PHONE case
    const caseRecord = await caseService.createCase({
      channel: 'PHONE',
      subject: `Inbound call from ${ani}`,
      customerPhone: ani,
      metadata: { callUuid: uuid, dnis, ani }
    }, agentId)

    // Track call in Redis for real-time controls
    await redis.hset(`call:${uuid}`, {
      caseId: caseRecord.id,
      agentId,
      startedAt: Date.now(),
      status: 'answered'
    })

    await redis.publish('call:connected', JSON.stringify({
      uuid, caseId: caseRecord.id, agentId, ani
    }))
  }

  private async onCallEnded(event: any) {
    const uuid      = event.getHeader('Unique-ID')
    const duration  = parseInt(event.getHeader('variable_billsec') || '0')
    const hangupBy  = event.getHeader('Hangup-Cause')

    const callData = await redis.hgetall(`call:${uuid}`)
    
    if (callData?.caseId) {
      // Store CDR
      await prisma.caseEvent.create({
        data: {
          caseId: callData.caseId,
          eventType: 'call.ended',
          payload: { uuid, duration, hangupBy, endedAt: new Date() }
        }
      })
    }

    await redis.del(`call:${uuid}`)
    await redis.publish('call:ended', JSON.stringify({ uuid, duration }))
  }

  // DTMF pause for PCI compliance — pause recording during card capture
  async pauseRecording(uuid: string) {
    await this.conn.bgapi(`uuid_record ${uuid} pause`)
    await this.logAuditEvent(uuid, 'recording_paused')
  }

  async resumeRecording(uuid: string) {
    await this.conn.bgapi(`uuid_record ${uuid} resume`)
    await this.logAuditEvent(uuid, 'recording_resumed')
  }
}
```

#### 7.4 WebRTC Softphone (SIP.js in Browser)

```typescript
// apps/web/src/components/telephony/Softphone.tsx
import { UserAgent, Invitation, Registerer } from 'sip.js'

export function Softphone({ agentId, extension }: Props) {
  const [status, setStatus] = useState<'idle' | 'ringing' | 'connected'>('idle')
  const sessionRef = useRef<Invitation | null>(null)

  useEffect(() => {
    const ua = new UserAgent({
      uri: UserAgent.makeURI(`sip:${extension}@${process.env.NEXT_PUBLIC_SIP_DOMAIN}`),
      transportOptions: {
        server: `wss://${process.env.NEXT_PUBLIC_FREESWITCH_HOST}:7443`
      },
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: false }
      }
    })

    ua.delegate = {
      onInvite: (invitation) => {
        setStatus('ringing')
        sessionRef.current = invitation
      }
    }

    const registerer = new Registerer(ua)
    ua.start().then(() => registerer.register())

    return () => { ua.stop() }
  }, [])

  const answer = () => {
    sessionRef.current?.accept()
    setStatus('connected')
  }

  const hangup = () => {
    sessionRef.current?.bye()
    setStatus('idle')
  }

  return (
    <div className="softphone">
      {status === 'ringing' && (
        <button onClick={answer} className="btn-answer">Answer</button>
      )}
      {status === 'connected' && (
        <button onClick={hangup} className="btn-hangup">Hang Up</button>
      )}
    </div>
  )
}
```

### Deliverables
- [ ] FreeSWITCH container starts and registers
- [ ] Inbound call creates a PHONE case automatically
- [ ] Agent answers call in browser via WebRTC
- [ ] Call metadata (ANI, DNIS, duration) stored on case
- [ ] Pause/resume recording API works (PCI compliance)
- [ ] Call end triggers CDR storage in `case_events`

---

## Week 8 — Encrypted Call Recordings

### Objectives
Store all call recordings in MinIO with AES-256 server-side encryption. Implement role-gated presigned URL playback with full access logging.

### Tasks

#### 8.1 MinIO Bucket Configuration

```typescript
// scripts/setup-minio.ts
import { Client } from 'minio'

const minio = new Client({
  endPoint: process.env.MINIO_HOST,
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD
})

async function setup() {
  // Create recordings bucket if not exists
  const exists = await minio.bucketExists('ccmp-recordings')
  if (!exists) {
    await minio.makeBucket('ccmp-recordings', 'us-east-1')
  }

  // Set lifecycle policy: delete after 90 days
  await minio.setBucketLifecycle('ccmp-recordings', {
    Rule: [{
      ID: 'recording-retention',
      Status: 'Enabled',
      Filter: { Prefix: 'recordings/' },
      Expiration: { Days: 90 }
    }]
  })

  // Enable server-side encryption
  await minio.setBucketEncryption('ccmp-recordings', {
    Rule: [{
      ApplyServerSideEncryptionByDefault: {
        SSEAlgorithm: 'AES256'
      }
    }]
  })
}
```

#### 8.2 Recording Upload Service

```typescript
// apps/api/src/modules/recordings/recording.service.ts

export class RecordingService {
  async ingestRecording(callUuid: string, caseId: string, localPath: string) {
    const fileName = `${callUuid}.wav`
    const minioKey = `recordings/${new Date().getFullYear()}/${caseId}/${fileName}`

    // Upload to MinIO — server-side AES-256 encryption applied automatically
    await minio.fPutObject('ccmp-recordings', minioKey, localPath, {
      'Content-Type': 'audio/wav',
      'x-amz-server-side-encryption': 'AES256',
      'x-ccmp-case-id': caseId,
      'x-ccmp-call-uuid': callUuid
    })

    // Get file stats for metadata
    const stat = await minio.statObject('ccmp-recordings', minioKey)

    // Store reference in DB
    const recording = await prisma.recording.create({
      data: {
        caseId,
        minioKey,
        isEncrypted: true,
        fileSizeBytes: stat.size,
        playbackRoles: ['QA_ANALYST', 'SUPERVISOR', 'ADMIN']
      }
    })

    // Remove local temp file
    await fs.unlink(localPath)

    return recording
  }

  async generatePlaybackUrl(recordingId: string, requestorId: string, requestorRole: string) {
    const recording = await prisma.recording.findUniqueOrThrow({
      where: { id: recordingId }
    })

    // Role-gate check
    if (!recording.playbackRoles.includes(requestorRole)) {
      throw new ForbiddenError('Your role is not permitted to play this recording.')
    }

    // Generate presigned URL — valid for 15 minutes only
    const url = await minio.presignedGetObject(
      'ccmp-recordings',
      recording.minioKey,
      900  // 15 minutes in seconds
    )

    // ALWAYS log playback access
    await prisma.auditLog.create({
      data: {
        actorId: requestorId,
        resourceType: 'recording',
        resourceId: recordingId,
        action: 'played',
        metadata: { caseId: recording.caseId, ttlSeconds: 900 }
      }
    })

    return { url, expiresIn: 900 }
  }
}
```

#### 8.3 BullMQ Retention Cleanup Job

```typescript
// workers/src/processors/recording-retention.processor.ts
// Runs daily at 02:00 UTC via BullMQ cron

export async function recordingRetentionCleanup() {
  const retentionDays = parseInt(process.env.RECORDING_RETENTION_DAYS || '90')
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const oldRecordings = await prisma.recording.findMany({
    where: { createdAt: { lt: cutoff } }
  })

  for (const rec of oldRecordings) {
    try {
      await minio.removeObject('ccmp-recordings', rec.minioKey)
      await prisma.recording.delete({ where: { id: rec.id } })
      // Keep audit log entry — never delete audit logs
    } catch (err) {
      logger.error({ recordingId: rec.id, err }, 'Failed to delete recording')
    }
  }
}
```

### Deliverables
- [ ] MinIO bucket created with AES-256 SSE policy
- [ ] 90-day retention lifecycle policy applied
- [ ] Recording upload works end-to-end from FreeSWITCH
- [ ] Presigned URL generation enforces role check
- [ ] Every playback generates an audit log entry
- [ ] Daily retention cleanup job scheduled

---

## Week 9 — Supervisor Dashboard

### Objectives
Build the full supervisor dashboard with live queue monitoring, agent workload view, and case management actions.

### Tasks

#### 9.1 Supervisor Dashboard Layout

```
┌──────────────────────────────────────────────────────────────┐
│  SUPERVISOR DASHBOARD                     🔴 3 SLA Breaches  │
├──────────────┬───────────────────────────────────────────────┤
│  QUEUES      │  AGENT WORKLOAD                               │
│              │                                               │
│  General     │  Agent        Cases  SLA Risk  Presence       │
│  ████ 24     │  J. Smith     8      🔴 2 warn  ● Online      │
│              │  B. Lee       5      🟢 OK       ● Online      │
│  Billing     │  A. Wu        10     🔴 BREACH  ● Busy        │
│  ████████ 48 │  M. Jones     3      🟢 OK       ○ Away       │
│              │                                               │
│  Technical   ├───────────────────────────────────────────────┤
│  ██ 12       │  SLA HEATMAP                                  │
│              │  (colour-coded grid of all active cases)      │
└──────────────┴───────────────────────────────────────────────┘
```

#### 9.2 Live Queue Monitor API

```typescript
// GET /api/v1/supervisor/queues — refreshed every 10s via React Query

async getLiveQueueData(supervisorId: string) {
  const [queues, agentPresences] = await Promise.all([
    prisma.queue.findMany({ where: { isActive: true }, include: { _count: { select: { cases: { where: { status: { notIn: ['RESOLVED','CLOSED'] } } } } } } }),
    getTeamPresences(supervisorId)
  ])

  return queues.map(q => ({
    id: q.id,
    name: q.name,
    activeCases: q._count.cases,
    waitingCases: await redis.llen(`queue:${q.id}:waiting`),
    avgWaitTimeSec: await getAvgWaitTime(q.id),
    agents: agentPresences.filter(a => a.queueId === q.id)
  }))
}
```

#### 9.3 Supervisor Actions API

```typescript
// Reassign case
// POST /api/v1/supervisor/cases/:id/reassign
// Requires: SUPERVISOR role

async reassignCase(caseId: string, newAgentId: string, supervisorId: string) {
  const caseRecord = await prisma.case.findUniqueOrThrow({ where: { id: caseId } })
  
  await prisma.case.update({
    where: { id: caseId },
    data: {
      assignedTo: newAgentId,
      version: { increment: 1 },
      events: {
        create: {
          eventType: 'case.reassigned',
          actorId: supervisorId,
          payload: { fromAgent: caseRecord.assignedTo, toAgent: newAgentId, reason: 'supervisor_action' }
        }
      }
    }
  })

  // Notify both agents in real-time
  await redis.publish('case:reassigned', JSON.stringify({
    caseId,
    fromAgentId: caseRecord.assignedTo,
    toAgentId: newAgentId
  }))
}

// Force escalate
// POST /api/v1/supervisor/cases/:id/escalate
async forceEscalate(caseId: string, supervisorId: string, reason: string) { ... }

// Override SLA
// POST /api/v1/supervisor/cases/:id/sla-override
async overrideSla(caseId: string, supervisorId: string, newDueAt: Date, reason: string) {
  // Cancel existing BullMQ jobs, create new ones for new due date
  await slaService.cancelSlaJobs(caseId)
  await slaService.scheduleBreachAt(caseId, newDueAt)

  await prisma.auditLog.create({
    data: {
      actorId: supervisorId,
      resourceType: 'case',
      resourceId: caseId,
      action: 'sla_overridden',
      metadata: { newDueAt, reason }
    }
  })
}
```

#### 9.4 Case Aging Report

Cases in `WAITING_ON_CUSTOMER` status for more than 24 hours are auto-escalated:

```typescript
// BullMQ cron: every 4 hours
async caseAgingEscalation() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  
  const staleCases = await prisma.case.findMany({
    where: {
      status: 'WAITING_ON_CUSTOMER',
      updatedAt: { lt: cutoff }
    }
  })

  for (const c of staleCases) {
    await caseService.transitionStatus(c.id, 'ESCALATED', 'system', c.version)
  }
}
```

### Deliverables
- [ ] Live queue counts update in real-time via Socket.io
- [ ] Agent workload shows case count and SLA risk per agent
- [ ] Reassign case flow works in under 3 clicks
- [ ] Force escalate triggers escalation chain immediately
- [ ] SLA override cancels old BullMQ jobs and creates new ones
- [ ] Case aging job runs every 4 hours

---

## Week 10 — Chat Intake & Meilisearch

### Objectives
Add WebSocket-based live chat as an intake channel. Index cases in Meilisearch for sub-200ms full-text search across the agent desktop and supervisor view.

### Tasks

#### 10.1 Live Chat Intake (WebSocket)

```typescript
// apps/api/src/modules/chat/chat.gateway.ts

io.on('connection', (socket) => {
  // Customer-facing chat
  socket.on('chat:start', async (data: { customerEmail: string, subject: string }) => {
    const caseRecord = await caseService.createCase({
      channel: 'CHAT',
      subject: data.subject,
      customerEmail: data.customerEmail,
      metadata: { socketId: socket.id, startedAt: new Date() }
    }, 'system')

    socket.join(`chat:${caseRecord.id}`)
    socket.emit('chat:started', { caseId: caseRecord.id, caseNumber: caseRecord.caseNumber })

    // Notify routing engine
    await redis.publish('case:new', JSON.stringify({ caseId: caseRecord.id }))
  })

  socket.on('chat:message', async (data: { caseId: string, message: string }) => {
    await prisma.caseNote.create({
      data: {
        caseId: data.caseId,
        authorId: 'customer',
        content: data.message,
        isInternal: false
      }
    })

    // Fan out to agent
    io.to(`chat:${data.caseId}`).emit('chat:message', {
      from: 'customer',
      message: data.message,
      timestamp: new Date()
    })
  })
})
```

#### 10.2 Meilisearch Index Setup

```typescript
// packages/database/src/search/meilisearch.ts
import MeiliSearch from 'meilisearch'

const meili = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST,
  apiKey: process.env.MEILI_MASTER_KEY
})

export async function setupIndexes() {
  // Cases index
  const casesIndex = meili.index('cases')
  await casesIndex.updateSettings({
    searchableAttributes: [
      'caseNumber', 'subject', 'customerName',
      'customerEmail', 'customerPhone', 'tags'
    ],
    filterableAttributes: [
      'status', 'priority', 'channel', 'assignedTo', 'queueId', 'createdAt'
    ],
    sortableAttributes: ['createdAt', 'priority', 'slaDueAt'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness']
  })

  // Audit logs index
  const auditIndex = meili.index('audit_logs')
  await auditIndex.updateSettings({
    searchableAttributes: ['actorEmail', 'resourceType', 'resourceId', 'action'],
    filterableAttributes: ['actorId', 'resourceType', 'action', 'createdAt']
  })
}

// Sync a case to Meilisearch (called after every case write)
export async function indexCase(caseId: string) {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: { agent: { select: { displayName: true } } }
  })
  if (!caseRecord || caseRecord.deletedAt) {
    await meili.index('cases').deleteDocument(caseId)
    return
  }

  await meili.index('cases').addDocuments([{
    id: caseRecord.id,
    caseNumber: caseRecord.caseNumber,
    subject: caseRecord.subject,
    status: caseRecord.status,
    priority: caseRecord.priority,
    channel: caseRecord.channel,
    customerName: caseRecord.customerName,
    customerEmail: caseRecord.customerEmail,
    assignedTo: caseRecord.assignedTo,
    agentName: caseRecord.agent?.displayName,
    queueId: caseRecord.queueId,
    tags: caseRecord.tags,
    createdAt: caseRecord.createdAt.getTime()
  }])
}
```

#### 10.3 Search API

```typescript
// GET /api/v1/cases/search?q=billing&filter=status=IN_PROGRESS&sort=createdAt:desc

async searchCases(query: string, filters: string[], sort: string[], role: UserRole, userId: string) {
  // Role-scope the filter
  const roleFilter = role === 'AGENT' ? [`assignedTo = ${userId}`] : []

  const results = await meili.index('cases').search(query, {
    filter: [...roleFilter, ...filters],
    sort,
    limit: 50,
    attributesToHighlight: ['subject', 'customerName']
  })

  return results
}
```

### Deliverables
- [ ] Chat intake creates a CHAT case and routes via existing engine
- [ ] Real-time message delivery works between customer and agent
- [ ] Meilisearch indexes all existing cases on first sync
- [ ] New case writes trigger async Meilisearch indexing
- [ ] Search API returns results in < 200ms
- [ ] Role-scoping applied to search results

---

## Week 11 — Integration Testing & Phase Hardening

### Objectives
Write integration tests for all Phase 2 features. Fix edge cases. Ensure the system is stable before Phase 3 begins.

### Test Matrix

| Feature | Test Type | Tool |
|---|---|---|
| SLA warning/breach timing | Integration | Vitest + fake timers |
| State machine transitions | Unit | Vitest |
| ESL adapter event handling | Integration | Vitest + mock ESL server |
| Recording upload + presign | Integration | Vitest + MinIO test bucket |
| Supervisor reassign | E2E | Playwright |
| Chat message delivery | Integration | Socket.io test client |
| Meilisearch indexing | Integration | Vitest + Meilisearch test index |
| Role-based search scoping | Unit | Vitest |

### Key Edge Cases to Test

```typescript
describe('SLA Engine', () => {
  it('cancels breach job when case resolves before breach', async () => { ... })
  it('does not escalate already-CLOSED case on breach job fire', async () => { ... })
  it('handles missing SLA policy gracefully', async () => { ... })
  it('SLA override reschedules breach job correctly', async () => { ... })
})

describe('Optimistic Locking', () => {
  it('rejects PATCH if version is stale', async () => { ... })
  it('concurrent status updates do not corrupt state', async () => { ... })
})

describe('Recording Access', () => {
  it('AGENT role cannot generate playback URL', async () => { ... })
  it('every playback generates audit log entry', async () => { ... })
  it('presigned URL expires after 15 minutes', async () => { ... })
})
```

### Deliverables
- [ ] All new APIs have integration tests
- [ ] SLA timing edge cases covered
- [ ] No P0/P1 bugs open
- [ ] Performance: case list API p95 < 150ms under 100 concurrent users (k6 smoke test)

---

## Phase 2 Definition of Done

| Check | Criteria |
|---|---|
| ✅ SLA Engine | Breach fires escalation in < 60s; warning at 80% fires correctly |
| ✅ Telephony | Inbound call creates case; agent answers in browser |
| ✅ Recordings | AES-256 stored in MinIO; role-gated presigned playback; access logged |
| ✅ Supervisor | Live queue monitor, workload view, reassign/escalate/SLA override all working |
| ✅ Chat | WebSocket chat creates case and delivers messages in real-time |
| ✅ Search | Meilisearch indexed, sub-200ms results, role-scoped |
| ✅ Tests | All Phase 2 features have integration tests |

---

## Phase 2 → Phase 3 Handoff Checklist

- [ ] FreeSWITCH DTMF pause working and verified before any payment flow testing
- [ ] Recording retention policy confirmed with compliance team (default 90 days)
- [ ] BullMQ DLQ monitoring alert configured in Grafana
- [ ] SLA policies reviewed and signed off by operations team
- [ ] ADR-002 written: Telephony integration approach (FreeSWITCH vs alternatives)
- [ ] Load test: 50 concurrent agents handling calls without degradation

---

*Phase 2 of 5 · CCMP Implementation Roadmap · Prev: [Phase 1](./Phase-1_Foundation-and-Infrastructure.md) · Next: [Phase 3 — QA & Compliance](./Phase-3_QA-and-Compliance.md)*

---

## 🔍 Requirements Audit — Phase 2

### Gap Analysis

| ID | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| G2-01 | 🔴 Critical | §9.2–9.3 | Supervisor service methods defined but **no Express router** wires them to HTTP | **Missing** — Add `supervisor.router.ts` (see fix below) |
| G2-02 | 🔴 Critical | §8.2 | `generatePlaybackUrl()` exists but no HTTP route exposes it | **Missing** — Add `GET /api/v1/recordings/:id/playback-url` route |
| G2-03 | 🔴 Critical | §10.3 | `searchCases()` defined but no HTTP endpoint exposes it | **Missing** — Add `GET /api/v1/cases/search` route |
| G2-04 | 🔴 Critical | §9.3 | `forceEscalate()` body is `{ ... }` — stub only | **Missing** — Implement using escalation chain from §6.3 |
| G2-05 | 🟡 Important | §7.3 | `EslAdapter` constructed but never bootstrapped in Express app lifecycle | **Missing** — Instantiate and call `connect()` in `index.ts` |
| G2-06 | 🟡 Important | §8.3 | Retention cleanup defined but no BullMQ cron schedule provided | **Missing** — Add repeating job to `workers/src/index.ts` |
| G2-07 | 🟡 Important | §10.1 | Chat `io.on('connection')` handler has no socket authentication | **Missing** — Add Socket.IO auth middleware before handler |

**Actionable fix for G2-01 — Supervisor router:**
```typescript
// apps/api/src/modules/supervisor/supervisor.router.ts
import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { SupervisorService } from './supervisor.service'

const router  = Router()
const service = new SupervisorService()
const ROLES   = ['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN']

router.get ('/queues',                  requireRole(ROLES), async (req, res) => {
  res.json(await service.getLiveQueueData(req.user!.id))
})
router.post('/cases/:id/reassign',      requireRole(ROLES), async (req, res) => {
  await service.reassignCase(req.params.id, req.body.newAgentId, req.user!.id)
  res.status(204).send()
})
router.post('/cases/:id/escalate',      requireRole(ROLES), async (req, res) => {
  await service.forceEscalate(req.params.id, req.user!.id, req.body.reason)
  res.status(204).send()
})
router.post('/cases/:id/sla-override',  requireRole(ROLES), async (req, res) => {
  await service.overrideSla(req.params.id, req.user!.id, new Date(req.body.newDueAt), req.body.reason)
  res.status(204).send()
})
router.get ('/sla/heatmap',             requireRole(ROLES), async (req, res) => {
  res.json(await service.getSlaHeatmap(req.query.teamId as string))
})

export { router as supervisorRouter }
```

**Actionable fix for G2-06 — Retention cron:**
```typescript
// workers/src/index.ts — add alongside other worker startup
import { Queue } from 'bullmq'
const maintenanceQueue = new Queue('maintenance', { connection: redis })
// Daily at 02:00 UTC
await maintenanceQueue.add('recording-retention', {}, {
  repeat:  { pattern: '0 2 * * *' },
  jobId:   'recording-retention-daily'
})
// Every 4h case aging
await maintenanceQueue.add('case-aging-escalation', {}, {
  repeat:  { pattern: '0 */4 * * *' },
  jobId:   'case-aging-4h'
})
```

**Actionable fix for G2-07 — Chat socket auth:**
```typescript
// apps/api/src/modules/chat/chat.gateway.ts
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('Unauthorized'))
  try {
    const payload = await verifyJwt(token)   // Reuse Phase 1 JWT logic
    socket.data.user = payload
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})
```

---

## ✅ Phase 2 — Requirement Re-Verification Prompt

> **Instructions:** All items must be verified before Phase 3 begins. Every green check requires evidence (test output, screenshot, or log line) — not assertion.

| # | Requirement | Verification Method | Pass? |
|---|---|---|---|
| 1 | SLA warning fires at exactly 80% elapsed | Create case with 5-min SLA; verify Socket.IO `sla:warning` event at 4 min | ☐ |
| 2 | SLA breach triggers escalation within 60 seconds | 1-min SLA case; verify `ESCALATED` status + `sla.escalated` event in DB | ☐ |
| 3 | Resolving before breach cancels BullMQ jobs | Resolve case; query BullMQ — `sla_breach:${id}` job must be absent | ☐ |
| 4 | Inbound call creates a PHONE case automatically | Make test SIP call; verify case row with `channel=PHONE` in DB | ☐ |
| 5 | Agent answers call in browser via SIP.js | Manual: agent UI rings, agent clicks Answer, audio flows | ☐ |
| 6 | DTMF pause stops recording; resume restarts it | `POST /telephony/pause` mid-call; verify `uuid_record pause` sent to FreeSWITCH | ☐ |
| 7 | Recording stored with AES-256 SSE in MinIO | `mc stat ccmp-recordings/<key>` → `x-amz-server-side-encryption: AES256` | ☐ |
| 8 | AGENT role gets 403 on recording playback URL | AGENT token → `GET /recordings/:id/playback-url` → `403 Forbidden` | ☐ |
| 9 | Every recording playback creates audit log row | Generate URL as QA_ANALYST; query `audit_logs` for `action=played` | ☐ |
| 10 | Presigned URL expires after 15 min | Wait 16 min; HTTP GET presigned URL → 403/expired response | ☐ |
| 11 | Supervisor can view live queue counts | `GET /supervisor/queues` → returns queue objects with `activeCases` count | ☐ |
| 12 | Reassign case: both agents notified in real-time | Reassign case; verify both sockets receive `case:reassigned` event | ☐ |
| 13 | SLA override reschedules BullMQ jobs correctly | Override SLA; verify old job removed and new job has correct delay | ☐ |
| 14 | Chat `chat:start` event creates a CHAT case | Customer connects, sends `chat:start`; verify CHAT case in DB | ☐ |
| 15 | Chat socket authenticated (unauthed client rejected) | Connect socket without `auth.token` → socket disconnected with `Unauthorized` | ☐ |
| 16 | Meilisearch bulk sync indexes all existing cases | Run sync script; `GET /cases/search?q=CASE-00001` returns result | ☐ |
| 17 | New case write triggers Meilisearch update within 2s | Create case; search subject within 2s → appears in results | ☐ |
| 18 | Search respects role scoping for AGENT | AGENT token searches → all results have `assignedTo = agentId` | ☐ |
| 19 | Case list API p95 < 150ms at 100 concurrent users | `k6 run smoke.js` → p95 threshold passes | ☐ |
| 20 | No P0/P1 bugs open | Jira/GitHub Issues: zero open P0/P1 tickets | ☐ |
| 21 | ADR-002 committed | `docs/adr/002-telephony.md` exists in repo | ☐ |

---
*Phase 2 of 5 · CCMP Implementation Roadmap · Express.js migration applied · Requirements audit complete*
