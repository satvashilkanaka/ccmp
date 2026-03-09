# Phase 4 — Scalability & Performance
### CCMP Implementation Roadmap · Weeks 18–22

> **Goal:** Harden the platform to handle 500+ concurrent agents, validate performance under realistic load, and prepare the infrastructure for production traffic. This phase is about evidence — every performance claim must be backed by a k6 load test result. By the end, the system can scale horizontally without re-architecture.

---

## Overview

| Attribute | Value |
|---|---|
| **Duration** | 5 Weeks |
| **Team Focus** | DevOps (infra scaling), Backend (query tuning), Full-Stack (frontend perf) |
| **Primary Output** | Load-tested, production-hardened deployment |
| **Depends On** | Phase 3 complete; Grafana observability live |
| **Success Gate** | P95 API response < 200ms under 500 concurrent agents; zero data loss under failure injection |

---

## Performance Targets

These are the hard targets this phase must prove via k6 load tests. No target is met until a passing test exists.

| Metric | Target | Test Scenario |
|---|---|---|
| Case list API p95 | < 150ms | 500 virtual users, 2-minute sustained load |
| Case creation p95 | < 200ms | 200 concurrent case creations |
| Real-time event delivery | < 100ms | 500 Socket.io clients, broadcast test |
| Routing decision | < 50ms | Routing engine direct, 1000 req/min |
| Search (Meilisearch) | < 200ms | 100 concurrent search queries |
| SLA job scheduling | 0 missed under load | 10k case creation burst |
| Concurrent agents | 500 | Full simulation with presence + case grid refresh |
| Recording upload | < 5s for 10MB file | 50 concurrent uploads |
| Database read throughput | 5000 queries/sec | Read replica stress test |

---

## Week 18 — Database Optimization

### Objectives
Profile and optimize all slow queries. Implement table partitioning for long-term data growth. Set up Postgres read replica for report queries. Configure PgBouncer correctly for production load.

### Tasks

#### 18.1 Query Profiling with pg_stat_statements

```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find top 10 slowest queries
SELECT
  query,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Find queries with sequential scans on large tables
SELECT
  schemaname, tablename, seq_scan, seq_tup_read,
  idx_scan, n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_tup_read DESC;
```

#### 18.2 Index Audit & Missing Indexes

Run EXPLAIN ANALYZE on all critical query paths and add targeted indexes:

```sql
-- Compound index for agent desktop case list (most frequent query)
CREATE INDEX CONCURRENTLY idx_cases_agent_active
ON cases (assigned_to, status, priority, sla_due_at)
WHERE deleted_at IS NULL AND status NOT IN ('RESOLVED', 'CLOSED');

-- Partial index for SLA monitoring job
CREATE INDEX CONCURRENTLY idx_cases_sla_active
ON cases (sla_due_at, priority)
WHERE status NOT IN ('RESOLVED', 'CLOSED') AND sla_due_at IS NOT NULL;

-- GIN index for JSONB metadata search
CREATE INDEX CONCURRENTLY idx_cases_metadata_gin
ON cases USING GIN (metadata);

-- Audit log time-range queries (most common compliance export pattern)
CREATE INDEX CONCURRENTLY idx_audit_actor_ts
ON audit_logs (actor_id, created_at DESC);

-- Case events by type (used heavily in reports)
CREATE INDEX CONCURRENTLY idx_case_events_type_ts
ON case_events (event_type, created_at DESC);
```

> Use `CREATE INDEX CONCURRENTLY` for all new production indexes — it does not lock the table.

#### 18.3 Table Partitioning (pg_partman)

For long-running deployments, `cases` and `audit_logs` will grow unboundedly. Partition by month.

```sql
-- Step 1: Install pg_partman
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Step 2: Convert cases to partitioned table
-- This requires a migration window. Steps:
--   1. Create new partitioned table
--   2. Migrate data in batches
--   3. Swap foreign keys
--   4. Drop old table

CREATE TABLE cases_partitioned (
  LIKE cases INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Step 3: Create pg_partman template
SELECT partman.create_parent(
  p_parent_table  => 'public.cases_partitioned',
  p_control       => 'created_at',
  p_type          => 'range',
  p_interval      => 'monthly',
  p_premake       => 3  -- Pre-create 3 future partitions
);

-- Step 4: Configure retention (keep 24 months of partitions online)
UPDATE partman.part_config
SET retention = '24 months',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.cases_partitioned';
```

#### 18.4 PgBouncer Production Configuration

```ini
# config/pgbouncer/pgbouncer.ini

[databases]
ccmp = host=postgres port=5432 dbname=ccmp

[pgbouncer]
pool_mode = transaction          ; Transaction-level pooling (most efficient)
max_client_conn = 500           ; Max incoming connections
default_pool_size = 20           ; Connections per DB user
reserve_pool_size = 5            ; Emergency reserve
reserve_pool_timeout = 3

; Timeouts
server_idle_timeout = 600
client_idle_timeout = 0          ; Never disconnect idle clients
query_timeout = 30

; TLS
server_tls_sslmode = require
client_tls_sslmode = require

; Logging
log_connections = 0              ; Too noisy in production
log_disconnections = 0
log_pooler_errors = 1
stats_period = 60
```

> **Critical:** Never use `session` pool mode with PgBouncer when using `LISTEN/NOTIFY` — they are incompatible. Use direct connections for Postgres notifications.

#### 18.5 Read Replica Setup

```yaml
# docker-compose.yml addition
postgres-replica:
  image: postgres:16-alpine
  environment:
    POSTGRES_MASTER_HOST: postgres
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: ${REPLICATION_PASSWORD}
  volumes:
    - ./scripts/replica-init.sh:/docker-entrypoint-initdb.d/init.sh
    - postgres_replica_data:/var/lib/postgresql/data
```

```typescript
// packages/database/src/client.ts — separate clients for read/write

export const prismaWrite = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
})

export const prismaRead = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_URL } }  // Replica
})

// Convention: all report queries use prismaRead, all writes use prismaWrite
```

### Deliverables
- [ ] `pg_stat_statements` enabled; slow query report generated
- [ ] All missing indexes added with CONCURRENTLY
- [ ] `cases` and `audit_logs` partitioned by month
- [ ] PgBouncer in transaction mode; 500 client connections tested
- [ ] Read replica replicating in < 100ms lag
- [ ] All report services switched to read replica

---

## Week 19 — Redis & BullMQ Scaling

### Objectives
Configure Redis for production throughput. Validate BullMQ handles burst job creation without loss. Implement proper Redis key namespacing, expiry, and memory management.

### Tasks

#### 19.1 Redis Production Configuration

```bash
# config/redis/redis.conf

# Memory management
maxmemory 2gb
maxmemory-policy allkeys-lru    # Evict LRU keys when memory full
                                 # BullMQ job data survives; ephemeral cache evicted

# Persistence — AOF for durability, RDB for fast restart
appendonly yes
appendfsync everysec             # Fsync every second (balance of speed/durability)
save 900 1                       # RDB snapshot rules
save 300 10
save 60 10000

# Networking
tcp-keepalive 300
timeout 0
tcp-backlog 511

# Cluster-ready (for Phase 5 migration to Redis Cluster)
cluster-enabled no               # Disabled for MVP; enable when needed
```

#### 19.2 Key Namespace Strategy

All Redis keys must follow a consistent namespace pattern to prevent collisions and enable targeted eviction:

```typescript
// packages/shared/src/redis-keys.ts

export const RedisKeys = {
  // Agent presence — TTL 5 min, refreshed by heartbeat
  agentPresence:   (id: string) => `agent:${id}:presence`,
  agentWorkload:   (id: string) => `agent:${id}:workload`,

  // Queue state — no TTL (managed by routing engine)
  queueWaiting:    (id: string) => `queue:${id}:waiting`,
  queueWorkload:   (id: string) => `queue:${id}:workload`,

  // Active calls — TTL 4h (max call duration)
  call:            (uuid: string) => `call:${uuid}`,

  // SLA state — TTL matches sla_due_at
  slaState:        (caseId: string) => `sla:${caseId}`,

  // Sessions — TTL 30 min, refreshed on activity
  session:         (sessionId: string) => `session:${sessionId}`,

  // Rate limiting — TTL 1 min sliding window
  rateLimit:       (ip: string) => `ratelimit:${ip}`,

  // Routing rules cache — TTL 5 min (hot-reloaded on change)
  routingRules:    () => `routing:rules:active`,
  routingRuleHash: () => `routing:rules:hash`,

  // Idempotency keys — TTL 24h
  idempotency:     (key: string) => `idempotent:${key}`,
} as const
```

#### 19.3 BullMQ Burst Handling

Validate that BullMQ handles a burst of 10,000 case assignments without job loss:

```typescript
// workers/src/processors/sla.processor.ts — production tuning

const slaWorker = new Worker('sla', processor, {
  connection: redis,
  concurrency: 50,              // Handle 50 simultaneous SLA jobs
  limiter: {
    max: 1000,                  // Max 1000 jobs per duration
    duration: 1000              // Per 1 second
  }
})

// Dead Letter Queue — failed jobs after 3 retries
slaWorker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= 3) {
    await dlqQueue.add('failed_sla_job', {
      originalJob: job.name,
      data: job.data,
      error: err.message,
      failedAt: new Date()
    })
    logger.error({ jobId: job.id, err }, 'SLA job moved to DLQ after 3 failures')
  }
})

// Monitor DLQ size in Grafana — alert if > 10 items
```

#### 19.4 Socket.io Horizontal Scaling

```typescript
// apps/api/src/plugins/socket.ts — Redis adapter for multi-node

import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'

const pubClient = createClient({ url: process.env.REDIS_URL })
const subClient = pubClient.duplicate()

await Promise.all([pubClient.connect(), subClient.connect()])

io.adapter(createAdapter(pubClient, subClient))

// Now broadcast from ANY Node.js instance reaches ALL connected clients
// Traefik load balances requests across instances
// Socket.io sticky sessions via Traefik's cookie-based LB
```

```yaml
# Traefik sticky session config for Socket.io
labels:
  - "traefik.http.services.api.loadbalancer.sticky.cookie=true"
  - "traefik.http.services.api.loadbalancer.sticky.cookie.name=ccmp-lb"
  - "traefik.http.services.api.loadbalancer.sticky.cookie.httponly=true"
```

### Deliverables
- [ ] Redis AOF persistence enabled and verified
- [ ] All keys follow namespace convention with appropriate TTLs
- [ ] BullMQ burst test: 10k jobs created, 0 lost
- [ ] DLQ alert fires in Grafana when DLQ exceeds 10 items
- [ ] Socket.io Redis adapter working; broadcast verified across 2 API instances
- [ ] Traefik sticky sessions configured for WebSocket connections

---

## Week 20 — Load Testing with k6

### Objectives
Write and run comprehensive k6 load tests for every major API endpoint and the Socket.io real-time layer. Tests must prove all performance targets are met before Phase 5 begins.

### Tasks

#### 20.1 k6 Test Scenarios

```javascript
// load-tests/scenarios/agent-workload.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { WebSocket } from 'k6/experimental/websockets'

export const options = {
  scenarios: {
    // Scenario 1: 500 agents browsing their case lists
    case_list: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 100 },
        { duration: '3m', target: 500 },
        { duration: '2m', target: 500 },
        { duration: '1m', target: 0   }
      ],
    },

    // Scenario 2: Concurrent case creation burst
    case_creation: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 250,
    },

    // Scenario 3: Real-time event load
    websocket_load: {
      executor: 'constant-vus',
      vus: 500,
      duration: '3m',
    }
  },
  thresholds: {
    'http_req_duration{endpoint:case_list}':   ['p(95)<150'],  // 150ms p95
    'http_req_duration{endpoint:case_create}': ['p(95)<200'],  // 200ms p95
    'http_req_duration{endpoint:search}':      ['p(95)<200'],  // 200ms p95
    'http_req_failed':                         ['rate<0.001'], // < 0.1% errors
    'ws_session_duration':                     ['p(95)<100'],  // WS event < 100ms
  }
}

export default function agentCaseList() {
  const token = getAuthToken()

  const res = http.get(`${BASE_URL}/api/v1/cases?status=IN_PROGRESS&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: 'case_list' }
  })

  check(res, {
    'status is 200': (r) => r.status === 200,
    'returns cases array': (r) => r.json().data?.length >= 0,
  })

  sleep(1)
}
```

#### 20.2 Routing Engine Load Test

```javascript
// load-tests/scenarios/routing-engine.js

export const options = {
  scenarios: {
    routing_decisions: {
      executor: 'constant-arrival-rate',
      rate: 1000,           // 1000 routing decisions per minute
      timeUnit: '1m',
      duration: '5m',
      preAllocatedVUs: 50
    }
  },
  thresholds: {
    'http_req_duration{endpoint:routing}': ['p(95)<50'],  // 50ms p95
    'http_req_failed': ['rate<0.001']
  }
}

export default function routingDecision() {
  const payload = {
    channel: 'PHONE',
    language: 'en',
    customerTier: 'STANDARD',
    issueType: 'billing',
    priority: 'HIGH'
  }

  const res = http.post(`${ROUTING_SERVICE_URL}/route`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'routing' }
  })

  check(res, {
    'routing decision returned': (r) => r.status === 200,
    'queue assigned': (r) => r.json().queueId !== undefined,
  })
}
```

#### 20.3 Database Connection Pool Test

```javascript
// load-tests/scenarios/db-connection-pool.js
// Simulates PgBouncer under maximum load

export const options = {
  vus: 500,
  duration: '5m',
  thresholds: {
    'http_req_failed': ['rate<0.001'],              // No connection pool exhaustion errors
    'http_req_duration': ['p(99)<500'],             // Even p99 under 500ms
  }
}
```

#### 20.4 Load Test Results Dashboard

Create a Grafana dashboard that ingests k6 output:

```yaml
# k6 sends metrics to Grafana via InfluxDB or Prometheus remote write
k6 run --out influxdb=http://influxdb:8086/k6 load-tests/scenarios/agent-workload.js
```

Grafana panels:
- Virtual Users over time
- Request rate (req/s)
- P50/P95/P99 latency per endpoint
- Error rate
- DB connection pool utilisation (from PgBouncer stats)
- Redis memory usage during test

### Deliverables
- [ ] All 5 k6 scenarios written and passing thresholds
- [ ] Load test results exported and committed to `load-tests/results/`
- [ ] Grafana load test dashboard created
- [ ] All performance targets met (see table at top of phase)
- [ ] At least one bottleneck found, fixed, and re-tested

---

## Week 21 — Frontend Performance

### Objectives
Optimize the Next.js frontend for real-world performance. Agent desktop must feel instant under load. Focus on bundle size, rendering strategy, and WebSocket reconnection resilience.

### Tasks

#### 21.1 Next.js Bundle Analysis

```bash
# Analyse bundle composition
pnpm build
pnpm analyze  # requires @next/bundle-analyzer configured

# Target: main JS bundle < 200kB gzipped
# Target: initial page load (agent desktop) < 2s on 4G
```

Key optimizations:
- Use `next/dynamic` for heavy components (Recharts, call recordings player)
- Code-split by route — compliance module should not be in agent bundle
- Use Server Components for data-heavy read-only views (supervisory reports)
- Replace heavy date libraries with native Intl API

```tsx
// Dynamic import for heavy components
const RecordingPlayer = dynamic(() => import('@/components/RecordingPlayer'), {
  ssr: false,
  loading: () => <Skeleton className="h-12 w-full" />
})

const RechartsChart = dynamic(() => import('@/components/ReportChart'), {
  ssr: false
})
```

#### 21.2 React Query Optimizations

```typescript
// Stale-while-revalidate for case list — feels instant
const { data: cases } = useQuery({
  queryKey: ['cases', filters],
  queryFn: fetchCases,
  staleTime: 30_000,         // Consider fresh for 30s
  gcTime: 5 * 60_000,        // Keep in cache for 5 minutes
  refetchInterval: 30_000,   // Background refresh every 30s
  refetchIntervalInBackground: true
})

// Optimistic updates for status changes — instant UI feedback
const mutation = useMutation({
  mutationFn: updateCaseStatus,
  onMutate: async ({ caseId, newStatus }) => {
    await queryClient.cancelQueries({ queryKey: ['cases'] })
    const previous = queryClient.getQueryData(['cases'])

    queryClient.setQueryData(['cases'], (old: Case[]) =>
      old.map(c => c.id === caseId ? { ...c, status: newStatus } : c)
    )

    return { previous }
  },
  onError: (err, vars, context) => {
    queryClient.setQueryData(['cases'], context?.previous)
    toast.error('Status update failed — please try again')
  }
})
```

#### 21.3 WebSocket Reconnection Strategy

Agents must recover gracefully if the WebSocket drops (network blip, server restart):

```typescript
// apps/web/src/hooks/useRealtimeConnection.ts

export function useRealtimeConnection() {
  const [connected, setConnected] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL, {
      auth: { token: getAccessToken() },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,  // Max 30s between retries
      randomizationFactor: 0.5       // Add jitter to prevent thundering herd
    })

    socket.on('connect', () => {
      setConnected(true)
      setReconnectAttempts(0)

      // Re-join rooms after reconnect (server may have restarted)
      socket.emit('agent:rejoin', { agentId: currentUser.id })

      // Invalidate React Query cache to re-fetch any missed updates
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    })

    socket.on('disconnect', (reason) => {
      setConnected(false)
      if (reason === 'io server disconnect') {
        // Server intentionally disconnected (e.g., session expired)
        redirectToLogin()
      }
    })

    socket.on('reconnect_attempt', (attempt) => {
      setReconnectAttempts(attempt)
    })

    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [])

  return { connected, reconnectAttempts, socket: socketRef.current }
}
```

#### 21.4 Infinite Scroll for Case Grid

Replace pagination with infinite scroll for agent desktop:

```typescript
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useInfiniteQuery({
  queryKey: ['cases', filters],
  queryFn: ({ pageParam = null }) => fetchCases({ cursor: pageParam, ...filters }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  initialPageParam: null
})

// Intersection Observer triggers next page load
const { ref } = useInView({
  onChange: (inView) => { if (inView && hasNextPage) fetchNextPage() }
})
```

### Deliverables
- [ ] Main bundle < 200kB gzipped
- [ ] Initial agent desktop load < 2s (Lighthouse score)
- [ ] WebSocket reconnects within 5s after server restart
- [ ] Missed updates fetched on reconnect (no stale state)
- [ ] Optimistic updates feel instant on status changes

---

## Week 22 — Failure Testing & Resilience

### Objectives
Inject failures deliberately and prove the system degrades gracefully rather than catastrophically. Document recovery procedures.

### Tasks

#### 22.1 Failure Scenarios Matrix

| Failure | Expected Behaviour | Test Method |
|---|---|---|
| Postgres primary down | API returns 503; writes queued in BullMQ; agents warned | `docker stop postgres` |
| Redis down | WebSocket events degrade to polling; routing falls to round-robin | `docker stop redis` |
| BullMQ worker crash | DLQ accumulates; Grafana alert fires; manual replay | `kill -9` worker process |
| FreeSWITCH restart | Calls gracefully terminated; cases not lost; ESL reconnects | `docker restart freeswitch` |
| Single API instance down | Traefik routes to remaining instances; WebSocket reconnects | `docker stop api-1` |
| MinIO unavailable | Recording upload retried 3×; agent warned if fails | `docker stop minio` |
| SLA job fire on closed case | Job is a no-op; no escalation triggered; logged as "skipped" | Manipulate job delay |
| Concurrent case updates | Optimistic lock rejects second update with 409; client retries | Parallel API test |

#### 22.2 Circuit Breaker for External Services

```typescript
// apps/api/src/lib/circuit-breaker.ts
import CircuitBreaker from 'opossum'

function createBreaker<T>(fn: (...args: unknown[]) => Promise<T>, options = {}) {
  const breaker = new CircuitBreaker(fn, {
    timeout: 3000,        // Fail if takes > 3s
    errorThresholdPercentage: 50,  // Open after 50% failure rate
    resetTimeout: 30000,  // Try again after 30s
    ...options
  })

  breaker.on('open',     () => logger.warn({ service: fn.name }, 'Circuit breaker OPEN'))
  breaker.on('halfOpen', () => logger.info({ service: fn.name }, 'Circuit breaker HALF-OPEN'))
  breaker.on('close',    () => logger.info({ service: fn.name }, 'Circuit breaker CLOSED'))

  // Expose state to Prometheus
  breaker.on('open', () => metrics.circuitBreakerState.set({ service: fn.name }, 1))
  breaker.on('close', () => metrics.circuitBreakerState.set({ service: fn.name }, 0))

  return breaker
}

export const eslBreaker     = createBreaker(eslAdapter.sendCommand)
export const emailBreaker   = createBreaker(emailService.send)
export const minioBreaker   = createBreaker(minioClient.putObject)
```

#### 22.3 Graceful Shutdown

```typescript
// apps/api/src/server.ts

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown initiated')

  // 1. Stop accepting new requests
  server.close()

  // 2. Wait for in-flight requests (max 30s)
  await new Promise<void>((resolve) => setTimeout(resolve, 30000))

  // 3. Pause BullMQ workers (let current jobs finish)
  await Promise.all(workers.map(w => w.pause()))

  // 4. Close DB connections
  await prismaWrite.$disconnect()
  await prismaRead.$disconnect()

  // 5. Close Redis connections
  await redis.quit()

  logger.info('Graceful shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))
```

#### 22.4 Backup & Restore Runbook

```bash
#!/bin/bash
# scripts/backup.sh — Run daily via cron

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/${DATE}"
mkdir -p "${BACKUP_DIR}"

# 1. Postgres dump
docker exec postgres pg_dump -U ccmp_user -Fc ccmp > "${BACKUP_DIR}/postgres.dump"

# 2. Compress and encrypt
gpg --symmetric --cipher-algo AES256 "${BACKUP_DIR}/postgres.dump"
rm "${BACKUP_DIR}/postgres.dump"

# 3. Upload to offsite storage (MinIO bucket in different region)
mc cp "${BACKUP_DIR}/postgres.dump.gpg" "offsite/ccmp-backups/${DATE}/"

# 4. Verify backup is readable
pg_restore --list "${BACKUP_DIR}/postgres.dump.gpg" | head -20

echo "Backup complete: ${BACKUP_DIR}"
```

```bash
#!/bin/bash
# scripts/restore.sh — Restore from backup

BACKUP_FILE=$1

# 1. Decrypt
gpg --decrypt "${BACKUP_FILE}" > /tmp/restore.dump

# 2. Stop application services (keep DB running)
docker compose stop api routing-service worker nextjs

# 3. Drop and recreate DB
docker exec postgres psql -U ccmp_user -c "DROP DATABASE IF EXISTS ccmp_restore;"
docker exec postgres psql -U ccmp_user -c "CREATE DATABASE ccmp_restore;"

# 4. Restore
docker exec postgres pg_restore -U ccmp_user -d ccmp_restore /tmp/restore.dump

# 5. Verify row counts match expected
docker exec postgres psql -U ccmp_user -d ccmp_restore -c "
  SELECT 'cases' AS table_name, COUNT(*) FROM cases
  UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
  UNION ALL SELECT 'case_events', COUNT(*) FROM case_events;
"

# 6. Promote to production (after verification)
echo "Backup restored to ccmp_restore. Verify, then promote."
```

**Recovery Time Target:** Full restore from backup < 2 hours (must be tested and proven).

### Deliverables
- [ ] All 8 failure scenarios tested and documented
- [ ] Circuit breakers in place for all external service calls
- [ ] Graceful shutdown verified: no in-flight requests lost
- [ ] Backup script runs, creates encrypted dump, uploads to offsite
- [ ] Restore script proven: full restore in < 2 hours
- [ ] DR runbook written and reviewed by team lead

---

## Phase 4 Definition of Done

| Check | Criteria |
|---|---|
| ✅ DB Performance | P95 case list < 150ms under 500 VUs — k6 proof |
| ✅ Routing | P95 routing decision < 50ms — k6 proof |
| ✅ Real-time | WS event delivery < 100ms — Socket.io load test proof |
| ✅ DB Partitioning | `cases` and `audit_logs` partitioned by month |
| ✅ Read Replica | All reports confirmed using replica; no read on primary |
| ✅ Bundle Size | Main JS bundle < 200kB gzipped |
| ✅ Resilience | All 8 failure scenarios tested; no data loss observed |
| ✅ Backup/Restore | Proven restore from backup in < 2 hours |
| ✅ Circuit Breakers | All external services wrapped; state visible in Grafana |

---

## Phase 4 → Phase 5 Handoff Checklist

- [ ] All k6 results committed to `load-tests/results/` with timestamps
- [ ] Performance regression baseline exported from Grafana
- [ ] Backup/restore runbook reviewed and signed off by ops team
- [ ] DR plan documented: defines RTO (2h) and RPO (24h max data loss)
- [ ] ADR-004 written: Scaling decision — when to migrate from Docker Compose to K8s
- [ ] Zero open P0/P1 bugs
- [ ] All circuit breaker states visible in Grafana ops dashboard

---

*Phase 4 of 5 · CCMP Implementation Roadmap · Prev: [Phase 3](./Phase-3_QA-and-Compliance.md) · Next: [Phase 5 — Security, Admin & Production Go-Live](./Phase-5_Security-Admin-GoLive.md)*

---

## 🔍 Requirements Audit — Phase 4

### Gap Analysis

| ID | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| G4-01 | 🔴 Critical | §20.1 | k6 scenario references `agentCaseList()` export but separate routing and WebSocket scenarios lack full code | **Missing** — Provide complete k6 scripts for all 3 main scenarios |
| G4-02 | 🔴 Critical | §21.4 | Infinite scroll uses cursor pagination but the case list API (`GET /cases`) has no cursor parameter defined in any prior phase | **Missing** — Add `cursor` query param to `cases.router.ts` from Phase 1 |
| G4-03 | 🔴 Critical | §22.2 | `CircuitBreaker.OpenCircuitError` must be caught and converted to HTTP 503 — no Express error handler integration shown | **Missing** — Add `open` circuit handler to global Express error middleware |
| G4-04 | 🔴 Critical | §22.3 | `server.close()` in graceful shutdown — `server` is undefined; Phase 1 returns `httpServer` from `buildApp()` | **Fix** — Export `httpServer` from `buildApp()` and pass into shutdown handler |
| G4-05 | 🟡 Important | §18.3 | Partition migration described as multi-step but no batch data migration script provided | **Missing** — Provide `scripts/migrate-to-partitioned.sh` with safe batched copy |
| G4-06 | 🟡 Important | §19.1 | Two Redis instances mentioned (BullMQ + cache) in architecture but only one Redis service defined in docker-compose | **Flag** — Either add `redis-bullmq` service to docker-compose or document shared-with-key-prefix strategy |

**Actionable fix for G4-01 — Complete k6 scripts:**
```javascript
// load-tests/scenarios/case-list.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 500 },
    { duration: '2m', target: 500 },
    { duration: '1m', target: 0 }
  ],
  thresholds: { 'http_req_duration{endpoint:case_list}': ['p(95)<150'], 'http_req_failed': ['rate<0.001'] }
}
export default function () {
  const res = http.get(`${__ENV.BASE_URL}/api/v1/cases?status=IN_PROGRESS&limit=20`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
    tags: { endpoint: 'case_list' }
  })
  check(res, { 'status 200': r => r.status === 200 })
  sleep(1)
}
```

```javascript
// load-tests/scenarios/websocket.js
import { WebSocket } from 'k6/experimental/websockets'
import { check, sleep } from 'k6'
export const options = {
  vus: 500, duration: '3m',
  thresholds: { 'ws_connecting': ['p(95)<500'] }
}
export default function () {
  const ws = new WebSocket(`${__ENV.WS_URL}`, null, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` }
  })
  ws.onopen = () => ws.send(JSON.stringify({ event: 'agent:join', agentId: `test-${__VU}` }))
  ws.onmessage = (e) => check(JSON.parse(e.data), { 'event received': d => !!d.event })
  sleep(3)
  ws.close()
}
```

**Actionable fix for G4-02 — Cursor pagination on case list:**
```typescript
// Add to cases.router.ts (Phase 1 §4.4)
router.get('/', authenticate, async (req, res) => {
  const { cursor, limit = '20', status, priority } = req.query as Record<string, string>
  const take = Math.min(parseInt(limit), 100)

  const cases = await prisma.case.findMany({
    take: take + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    where: {
      deletedAt: null,
      ...(status   && { status:   status as any }),
      ...(priority && { priority: priority as any }),
      // Role scoping
      ...(req.user!.role === 'AGENT' && { assignedTo: req.user!.id })
    },
    orderBy: { createdAt: 'desc' }
  })

  const hasMore    = cases.length > take
  const items      = hasMore ? cases.slice(0, take) : cases
  const nextCursor = hasMore ? items[items.length - 1].id : null
  res.json({ data: items, nextCursor, hasMore })
})
```

**Actionable fix for G4-03 — Circuit breaker → Express 503:**
```typescript
// apps/api/src/app.ts — append to global error handler
import CircuitBreaker from 'opossum'
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof CircuitBreaker.OpenCircuitError) {
    return res.status(503).json({ error: 'Service temporarily unavailable — circuit open', retryAfter: 30 })
  }
  const status = err.statusCode ?? err.status ?? 500
  res.status(status).json({ error: err.message ?? 'Internal Server Error' })
})
```

**Actionable fix for G4-04 — Correct graceful shutdown:**
```typescript
// apps/api/src/index.ts
import { buildApp } from './app'

let httpServer: ReturnType<typeof import('http').createServer>

async function main() {
  const result = await buildApp()
  httpServer = result.httpServer
  const port = Number(process.env.API_PORT ?? 4000)
  httpServer.listen(port, () => console.log(`API on :${port}`))
}

async function gracefulShutdown(signal: string) {
  console.log(`${signal} received — shutting down`)
  // 1. Stop accepting new connections
  httpServer.close(async () => {
    // 2. Pause BullMQ workers
    await Promise.all(workers.map(w => w.pause()))
    // 3. Close DB + Redis
    await prismaWrite.$disconnect()
    await redis.quit()
    console.log('Shutdown complete')
    process.exit(0)
  })
  // 4. Force-kill if shutdown takes > 30s
  setTimeout(() => process.exit(1), 30_000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))
main().catch(err => { console.error(err); process.exit(1) })
```

---

## ✅ Phase 4 — Requirement Re-Verification Prompt

> **Instructions:** All items must be verified before Phase 5 begins. Every performance claim must be backed by a saved k6 result file.

| # | Requirement | Verification Method | Pass? |
|---|---|---|---|
| 1 | `pg_stat_statements` enabled | `SELECT count(*) FROM pg_stat_statements` → > 0 rows | ☐ |
| 2 | All 5 compound indexes created without locking | `SELECT indexname FROM pg_indexes WHERE tablename='cases'` → confirm all 5 present | ☐ |
| 3 | `cases` table partitioned by month | `SELECT * FROM pg_partman.part_config WHERE parent_table='public.cases_partitioned'` | ☐ |
| 4 | PgBouncer in transaction mode with 500 client limit | `SHOW CONFIG` on PgBouncer → `pool_mode = transaction`, `max_client_conn = 500` | ☐ |
| 5 | Read replica replicating with < 100ms lag | `SELECT now() - pg_last_xact_replay_timestamp()` on replica → < 100ms | ☐ |
| 6 | All reports confirmed using read replica | Add `/* replica */` comment to report queries; verify in `pg_stat_activity` on replica | ☐ |
| 7 | Case list p95 < 150ms at 500 VUs | `k6 run case-list.js` → `http_req_duration{endpoint:case_list}: p(95)<150` threshold passes | ☐ |
| 8 | Case creation p95 < 200ms at 200 concurrent | `k6 run case-create.js` → threshold passes; result saved to `load-tests/results/` | ☐ |
| 9 | WebSocket event delivery < 100ms at 500 clients | `k6 run websocket.js` → `ws_connecting` threshold passes | ☐ |
| 10 | Routing decision p95 < 50ms at 1000 req/min | `k6 run routing.js` → threshold passes; result saved | ☐ |
| 11 | BullMQ burst: 10k jobs, 0 lost | Script creates 10k SLA jobs; poll until all processed; DLQ = 0 | ☐ |
| 12 | DLQ Grafana alert fires when DLQ > 10 | Manually enqueue 11 dead jobs → Slack/PagerDuty alert fires within 5 min | ☐ |
| 13 | Socket.IO Redis adapter: broadcast reaches all instances | Run 2 API instances; send event to one; verify client connected to other receives it | ☐ |
| 14 | Traefik sticky sessions for WebSocket | Connect client; restart one API instance; verify client stays connected to same instance | ☐ |
| 15 | Main JS bundle < 200kB gzipped | `pnpm build && pnpm analyze` → main chunk gzip < 200kB | ☐ |
| 16 | Agent desktop initial load < 2s | Lighthouse CI on staging → Performance score ≥ 80; FCP < 2s | ☐ |
| 17 | WebSocket reconnects within 5s after server restart | `docker restart api-1`; measure client reconnect time in logs | ☐ |
| 18 | Cursor pagination returns consistent pages | Fetch page 1 + page 2 with cursor; verify no duplicates, no gaps | ☐ |
| 19 | All 8 failure scenarios tested and documented | `docs/failure-scenarios.md` with test output per scenario | ☐ |
| 20 | Circuit breaker opens after 50% errors → 503 returned | Mock service fails > 50%; next call → `HTTP 503` from Express | ☐ |
| 21 | Graceful shutdown: no in-flight requests dropped | Send requests; `kill -SIGTERM <pid>`; verify all in-flight return 200 | ☐ |
| 22 | Encrypted backup created and uploaded to offsite | Run `scripts/backup.sh`; verify `.gpg` file in MinIO offsite bucket | ☐ |
| 23 | Full restore completes in < 2 hours | Time `scripts/restore.sh` end-to-end; verify row counts match | ☐ |
| 24 | Zero P0/P1 bugs open | Project issue tracker — filter P0/P1 → 0 results | ☐ |
| 25 | ADR-004 committed | `docs/adr/004-scaling.md` exists in repo | ☐ |

---
*Phase 4 of 5 · CCMP Implementation Roadmap · Requirements audit complete*
