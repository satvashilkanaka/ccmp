# Phase 1 — Foundation & Infrastructure

### CCMP Implementation Roadmap · Weeks 1–5

> **Goal:** Stand up a secured, containerized skeleton with authentication, core data model, and basic case creation. By the end of this phase, agents can log in, create cases manually, and see them in a list. Nothing more — but the bones are production-grade.

---

## Overview

| Attribute          | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Duration**       | 5 Weeks                                                   |
| **Team Focus**     | DevOps + 2× Full-Stack Engineers                          |
| **Primary Output** | Running Docker Compose stack, authenticated UI, case CRUD |
| **Success Gate**   | Agent can log in, create a case, and see it in the list   |

---

## Week 1 — Containerized Infrastructure

### Objectives

Set up the entire local development environment and production-equivalent Docker Compose stack. Every service that the platform will ever need should be provisioned now — even if not yet used — so engineers never have to change the infrastructure contract mid-build.

### Tasks

#### 1.1 Docker Compose Base Stack

Create `docker-compose.yml` with the following services, all on a shared `ccmp-network` bridge network:

```yaml
services:
  traefik:
    image: traefik:v3.0
    ports: ["80:80", "443:443", "8080:8080"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config/traefik:/etc/traefik
    labels:
      - "traefik.enable=true"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ccmp
      POSTGRES_USER: ccmp_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ccmp_user -d ccmp"]
      interval: 10s
      retries: 5

  pgbouncer:
    image: edoburu/pgbouncer:latest
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      PGBOUNCER_DATABASE: ccmp
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 500
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
    depends_on:
      postgres:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/ccmp
      KC_DB_USERNAME: ccmp_user
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
    volumes:
      - ./config/keycloak/realm-export.json:/opt/keycloak/data/import/realm.json
    depends_on:
      postgres:
        condition: service_healthy

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_SITE_REGION: us-east-1
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]

  meilisearch:
    image: getmeili/meilisearch:v1.7
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: production
    volumes:
      - meilisearch_data:/meili_data
```

#### 1.2 Environment Configuration

Create `.env.example` committed to the repo. Actual `.env` is gitignored.

```bash
# Postgres
POSTGRES_PASSWORD=change_me_strong_password

# Redis
REDIS_PASSWORD=change_me_redis_pass

# Keycloak
KEYCLOAK_ADMIN_PASSWORD=change_me_admin

# MinIO
MINIO_ROOT_USER=ccmp_admin
MINIO_ROOT_PASSWORD=change_me_minio

# Meilisearch
MEILI_MASTER_KEY=change_me_32char_minimum_key_here

# App
JWT_SECRET=change_me_jwt_secret
NODE_ENV=development
API_PORT=4000
NEXT_PUBLIC_API_URL=http://localhost:4000
```

#### 1.3 Traefik Configuration

Create `config/traefik/traefik.yml`:

```yaml
api:
  dashboard: true
  insecure: true # Development only — disable in production

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: ops@yourcompany.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
  file:
    directory: /etc/traefik/dynamic

log:
  level: INFO

accessLog: {}
```

### Deliverables

- [ ] All services start with `docker compose up -d`
- [ ] All health checks pass
- [ ] Traefik dashboard accessible at `localhost:8080`
- [ ] Postgres reachable via PgBouncer on port 6432
- [ ] MinIO console accessible at `localhost:9001`

---

## Week 2 — Database Schema & ORM

### Objectives

Define the complete Prisma schema. Run initial migrations. This is the most important week in Phase 1 — a well-designed schema prevents painful migrations later.

### Tasks

#### 2.1 Project Structure

```
ccmp/
├── apps/
│   ├── api/              # Express.js API (Node.js)
│   ├── web/              # Next.js 14 frontend
│   └── routing-service/  # FastAPI (Python)
├── packages/
│   ├── database/         # Prisma schema + client
│   ├── shared/           # Shared TypeScript types
│   └── config/           # Shared configs (eslint, tsconfig)
├── workers/              # BullMQ job processors
├── docker-compose.yml
└── .env
```

Use a **pnpm monorepo** with `pnpm-workspace.yaml`.

#### 2.2 Express.js Server Bootstrap

```typescript
// apps/api/src/app.ts
import "express-async-errors"; // patches async errors into Express error handler
import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import pinoHttp from "pino-http";

export async function buildApp() {
  const app = express();

  // ── Core middleware ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp()); // Structured request logging

  // ── Health check (unauthenticated) ──────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date() }));

  // ── API routers (mounted in Week 4 and beyond) ──────────────────────────────
  // app.use('/api/v1/cases',      casesRouter)
  // app.use('/api/v1/supervisor', supervisorRouter)
  // app.use('/api/v1/qa',         qaRouter)
  // app.use('/api/v1/audit',      auditRouter)
  // app.use('/api/v1/reports',    reportsRouter)
  // app.use('/api/v1/admin',      adminRouter)

  // ── 404 handler ─────────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

  // ── Global error handler ────────────────────────────────────────────────────
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status = err.statusCode ?? err.status ?? 500;
      res
        .status(status)
        .json({ error: err.message ?? "Internal Server Error" });
    }
  );

  // ── HTTP + Socket.IO ────────────────────────────────────────────────────────
  const httpServer = http.createServer(app);
  const io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [
        "http://localhost:3000",
      ],
    },
  });

  // Redis adapter for multi-node Socket.IO
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  return { app, httpServer, io };
}
```

```typescript
// apps/api/src/index.ts
import { buildApp } from "./app";

async function main() {
  const { httpServer } = await buildApp();
  const port = Number(process.env.API_PORT ?? 4000);
  httpServer.listen(port, () => console.log(`API on :${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

#### 2.3 Package Dependencies (Express.js)

Remove all `@fastify/*` packages. Use these drop-in equivalents:

```json
// apps/api/package.json
{
  "dependencies": {
    "express": "^4.19.2",
    "@types/express": "^4.17.21",
    "express-async-errors": "^3.1.1",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.3.1",
    "rate-limit-redis": "^4.2.0",
    "pino-http": "^10.2.0",
    "jsonwebtoken": "^9.0.2",
    "jwks-rsa": "^3.1.0",
    "socket.io": "^4.7.5",
    "@socket.io/redis-adapter": "^8.3.0",
    "redis": "^4.6.14",
    "bullmq": "^5.8.2",
    "@prisma/client": "^5.15.0",
    "zod": "^3.23.8"
  }
}
```

> **Remove:** `fastify`, `fastify-plugin`, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/swagger`

| Fastify                                 | Express Equivalent                        | Notes                        |
| --------------------------------------- | ----------------------------------------- | ---------------------------- |
| `fastify-plugin` + `fastify.decorate()` | Plain middleware function                 | See §3.2                     |
| `reply.code(N).send(obj)`               | `res.status(N).json(obj)`                 | Same semantics               |
| `reply.header(k, v)`                    | `res.setHeader(k, v)`                     | Same semantics               |
| `@fastify/helmet`                       | `helmet`                                  | Same API, framework-agnostic |
| `@fastify/cors`                         | `cors`                                    | Same API, framework-agnostic |
| `@fastify/rate-limit`                   | `express-rate-limit` + `rate-limit-redis` | See Phase 5 §23.3            |
| `fastify.addHook('onResponse')`         | `res.on('finish', cb)` in middleware      | See Phase 5 §24.4            |
| `request.ip`                            | `req.ip`                                  | Identical                    |

#### 2.4 Prisma Schema

File: `packages/database/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────────────────────────

enum UserRole {
  AGENT
  SENIOR_AGENT
  SUPERVISOR
  QA_ANALYST
  OPERATIONS_MANAGER
  COMPLIANCE_OFFICER
  ADMIN
}

enum CaseStatus {
  NEW
  ASSIGNED
  IN_PROGRESS
  WAITING_ON_CUSTOMER
  ESCALATED
  RESOLVED
  CLOSED
  REOPENED
}

enum CasePriority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum CaseChannel {
  PHONE
  EMAIL
  CHAT
  WEB_FORM
  API
}

enum AgentPresence {
  ONLINE
  BUSY
  AWAY
  OFFLINE
}

// ─── Core Models ──────────────────────────────────────────────────────────────

model User {
  id            String        @id @default(cuid())
  keycloakId    String        @unique @map("keycloak_id")
  email         String        @unique
  displayName   String        @map("display_name")
  role          UserRole
  teamId        String?       @map("team_id")
  skills        String[]      @default([])
  languages     String[]      @default(["en"])
  isActive      Boolean       @default(true) @map("is_active")
  deletedAt     DateTime?     @map("deleted_at")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  team          Team?         @relation(fields: [teamId], references: [id])
  assignedCases Case[]        @relation("AssignedAgent")
  caseEvents    CaseEvent[]
  qaReviews     QaReview[]
  auditLogs     AuditLog[]

  @@index([role])
  @@index([teamId])
  @@map("users")
}

model Team {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  timezone    String   @default("UTC")
  createdAt   DateTime @default(now()) @map("created_at")

  members     User[]
  queues      Queue[]

  @@map("teams")
}

model Case {
  id           String       @id @default(cuid())
  caseNumber   String       @unique @map("case_number")  // Human-readable: CASE-00001
  status       CaseStatus   @default(NEW)
  priority     CasePriority @default(MEDIUM)
  channel      CaseChannel
  subject      String
  customerId   String?      @map("customer_id")
  customerName String?      @map("customer_name")
  customerEmail String?     @map("customer_email")
  customerPhone String?     @map("customer_phone")
  assignedTo   String?      @map("assigned_to")
  queueId      String?      @map("queue_id")
  slaPolicy    String?      @map("sla_policy")
  slaFirstResponseAt DateTime? @map("sla_first_response_at")
  slaDueAt     DateTime?    @map("sla_due_at")
  firstResponseAt DateTime? @map("first_response_at")
  resolvedAt   DateTime?    @map("resolved_at")
  closedAt     DateTime?    @map("closed_at")
  metadata     Json         @default("{}") // Channel-specific extra data
  tags         String[]     @default([])
  version      Int          @default(1)   // Optimistic locking
  deletedAt    DateTime?    @map("deleted_at")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  agent        User?        @relation("AssignedAgent", fields: [assignedTo], references: [id])
  queue        Queue?       @relation(fields: [queueId], references: [id])
  events       CaseEvent[]
  notes        CaseNote[]
  attachments  Attachment[]
  recordings   Recording[]
  qaReviews    QaReview[]

  @@index([status, priority, slaDueAt])
  @@index([assignedTo])
  @@index([customerId])
  @@index([createdAt])
  @@map("cases")
}

model CaseEvent {
  id          String   @id @default(cuid())
  caseId      String   @map("case_id")
  eventType   String   @map("event_type")  // case.created, status.changed, assigned, escalated, etc.
  actorId     String?  @map("actor_id")
  fromStatus  String?  @map("from_status")
  toStatus    String?  @map("to_status")
  payload     Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")

  case        Case     @relation(fields: [caseId], references: [id])
  actor       User?    @relation(fields: [actorId], references: [id])

  @@index([caseId])
  @@index([eventType])
  @@index([createdAt])
  @@map("case_events")
}

model CaseNote {
  id          String   @id @default(cuid())
  caseId      String   @map("case_id")
  authorId    String   @map("author_id")
  content     String
  isInternal  Boolean  @default(true) @map("is_internal")
  createdAt   DateTime @default(now()) @map("created_at")

  case        Case     @relation(fields: [caseId], references: [id])

  @@index([caseId])
  @@map("case_notes")
}

model Attachment {
  id          String   @id @default(cuid())
  caseId      String   @map("case_id")
  uploadedBy  String   @map("uploaded_by")
  fileName    String   @map("file_name")
  mimeType    String   @map("mime_type")
  sizeBytes   Int      @map("size_bytes")
  minioKey    String   @map("minio_key")
  createdAt   DateTime @default(now()) @map("created_at")

  case        Case     @relation(fields: [caseId], references: [id])

  @@index([caseId])
  @@map("attachments")
}

model Queue {
  id             String   @id @default(cuid())
  name           String   @unique
  description    String?
  skillsRequired String[] @default([]) @map("skills_required")
  languages      String[] @default(["en"])
  teamId         String?  @map("team_id")
  maxCapacity    Int      @default(50) @map("max_capacity")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at")

  team           Team?    @relation(fields: [teamId], references: [id])
  cases          Case[]

  @@map("queues")
}

model SlaPolicy {
  id                String       @id @default(cuid())
  name              String       @unique
  priority          CasePriority
  channel           CaseChannel?
  firstResponseSec  Int          @map("first_response_sec")
  resolutionSec     Int          @map("resolution_sec")
  warningThreshold  Float        @default(0.8) @map("warning_threshold") // 80% elapsed
  isActive          Boolean      @default(true) @map("is_active")
  createdAt         DateTime     @default(now()) @map("created_at")

  @@unique([priority, channel])
  @@map("sla_policies")
}

model RoutingRule {
  id            String   @id @default(cuid())
  name          String
  description   String?
  conditions    Json     // {"language": "es"} or {"issue_type": "billing", "priority": "HIGH"}
  actions       Json     // {"assign_to_queue": "spanish_support"} or {"assign_to_role": "SENIOR_AGENT"}
  priorityOrder Int      @map("priority_order")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@index([priorityOrder])
  @@map("routing_rules")
}

model Recording {
  id             String   @id @default(cuid())
  caseId         String   @map("case_id")
  minioKey       String   @map("minio_key")
  durationSec    Int?     @map("duration_sec")
  fileSizeBytes  Int?     @map("file_size_bytes")
  isEncrypted    Boolean  @default(true) @map("is_encrypted")
  playbackRoles  String[] @default(["QA_ANALYST", "SUPERVISOR", "ADMIN"]) @map("playback_roles")
  createdAt      DateTime @default(now()) @map("created_at")

  case           Case     @relation(fields: [caseId], references: [id])

  @@index([caseId])
  @@map("recordings")
}

model QaReview {
  id             String   @id @default(cuid())
  caseId         String   @map("case_id")
  reviewerId     String   @map("reviewer_id")
  agentId        String   @map("agent_id")
  score          Float
  flags          String[] @default([])
  coachingNotes  String?  @map("coaching_notes")
  createdAt      DateTime @default(now()) @map("created_at")

  case           Case     @relation(fields: [caseId], references: [id])
  reviewer       User     @relation(fields: [reviewerId], references: [id])

  @@index([caseId])
  @@index([reviewerId])
  @@index([agentId])
  @@map("qa_reviews")
}

model AuditLog {
  id           String   @id @default(cuid())
  actorId      String?  @map("actor_id")
  actorEmail   String?  @map("actor_email")  // Denormalised — user may be deleted
  resourceType String   @map("resource_type")  // case, recording, audit_log, user
  resourceId   String   @map("resource_id")
  action       String   // viewed, created, updated, deleted, exported, played
  ipAddress    String?  @map("ip_address")
  sessionId    String?  @map("session_id")
  userAgent    String?  @map("user_agent")
  metadata     Json     @default("{}")
  createdAt    DateTime @default(now()) @map("created_at")

  actor        User?    @relation(fields: [actorId], references: [id])

  @@index([actorId, createdAt])
  @@index([resourceId, resourceType])
  @@index([createdAt])
  @@map("audit_logs")
}
```

#### 2.3 Seed Data

Create `packages/database/prisma/seed.ts` with:

- 3 default queues: `General Support`, `Billing`, `Technical`
- SLA policies for all priority levels
- 1 default routing rule (catch-all round-robin)
- 1 admin user placeholder

### Deliverables

- [ ] `pnpm prisma migrate dev` runs cleanly
- [ ] All tables created with correct indexes
- [ ] Seed data loaded: `pnpm prisma db seed`
- [ ] Prisma Studio accessible: `pnpm prisma studio`

---

## Week 3 — Keycloak RBAC & Auth Middleware

### Objectives

Configure Keycloak with all 7 roles. Build JWT validation middleware in Express.js. Connect the Next.js frontend with a working login flow.

### Tasks

#### 3.1 Keycloak Realm Configuration

Create `config/keycloak/realm-export.json` with:

```json
{
  "realm": "ccmp",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "roles": {
    "realm": [
      { "name": "AGENT" },
      { "name": "SENIOR_AGENT" },
      { "name": "SUPERVISOR" },
      { "name": "QA_ANALYST" },
      { "name": "OPERATIONS_MANAGER" },
      { "name": "COMPLIANCE_OFFICER" },
      { "name": "ADMIN" }
    ]
  },
  "clients": [
    {
      "clientId": "ccmp-web",
      "publicClient": true,
      "redirectUris": ["http://localhost:3000/*"],
      "webOrigins": ["http://localhost:3000"]
    },
    {
      "clientId": "ccmp-api",
      "secret": "${KEYCLOAK_API_SECRET}",
      "serviceAccountsEnabled": true
    }
  ]
}
```

#### 3.2 Express.js Auth Middleware

```typescript
// apps/api/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

// Extend Express Request to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string; sessionId: string };
    }
  }
}

const CCMP_ROLES = [
  "AGENT",
  "SENIOR_AGENT",
  "SUPERVISOR",
  "QA_ANALYST",
  "OPERATIONS_MANAGER",
  "COMPLIANCE_OFFICER",
  "ADMIN",
];

const jwks = jwksClient({
  jwksUri: `${process.env.KEYCLOAK_URL}/realms/ccmp/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
});

/**
 * authenticate — validates the Keycloak JWT in Authorization header.
 * Attaches req.user on success; responds 401 on failure.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = jwt.decode(token, { complete: true }) as any;
    const key = await jwks.getSigningKey(decoded?.header?.kid);
    const payload = jwt.verify(token, key.getPublicKey()) as any;

    req.user = {
      id: payload.sub,
      email: payload.email,
      role:
        payload.realm_access?.roles?.find((r: string) =>
          CCMP_ROLES.includes(r)
        ) ?? "",
      sessionId: payload.session_state,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * requireRole — composes authenticate + role check into a single middleware.
 * Usage: router.post('/path', requireRole(['SUPERVISOR', 'ADMIN']), handler)
 */
export function requireRole(roles: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    await authenticate(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    });
  };
}
```

#### 3.3 Role Permission Map

```typescript
// packages/shared/src/permissions.ts
export const ROLE_PERMISSIONS = {
  AGENT: [
    "cases:read:own",
    "cases:create",
    "cases:update:own",
    "notes:create",
    "attachments:upload",
  ],
  SENIOR_AGENT: [
    "cases:read:own",
    "cases:create",
    "cases:update:own",
    "cases:escalate",
    "notes:create",
    "attachments:upload",
  ],
  SUPERVISOR: [
    "cases:read:team",
    "cases:reassign",
    "cases:force_escalate",
    "cases:sla_override",
    "queues:read",
    "queues:manage",
    "recordings:playback",
    "reports:export",
  ],
  QA_ANALYST: ["cases:read:all", "recordings:playback", "qa:create", "qa:read"],
  OPERATIONS_MANAGER: [
    "cases:read:all",
    "reports:read",
    "reports:export",
    "dashboards:read",
  ],
  COMPLIANCE_OFFICER: ["audit:read", "audit:export"],
  ADMIN: ["*"], // All permissions
} as const;
```

#### 3.4 Next.js Auth Setup

Install and configure `next-auth` with Keycloak provider. Protect all pages except `/login` with middleware.

```typescript
// apps/web/src/middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

### Deliverables

- [ ] All 7 roles configured in Keycloak
- [ ] Login flow works end-to-end in Next.js
- [ ] JWT middleware validates tokens and attaches `request.user`
- [ ] Role-based nav items visible/hidden correctly per role
- [ ] Unauthorized API calls return 401; wrong-role calls return 403

---

## Week 4 — Case CRUD & State Machine

### Objectives

Build the core case management API with full state machine enforcement and event sourcing.

### Tasks

#### 4.1 Case Service

```typescript
// apps/api/src/modules/cases/case.service.ts

const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED"],
  IN_PROGRESS: ["WAITING_ON_CUSTOMER", "RESOLVED", "ESCALATED"],
  WAITING_ON_CUSTOMER: ["IN_PROGRESS", "ESCALATED", "RESOLVED"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED"],
};

export class CaseService {
  async createCase(data: CreateCaseDto, actorId: string) {
    const caseNumber = await this.generateCaseNumber();

    const newCase = await prisma.case.create({
      data: {
        ...data,
        caseNumber,
        status: "NEW",
        events: {
          create: {
            eventType: "case.created",
            actorId,
            payload: { channel: data.channel, subject: data.subject },
          },
        },
      },
    });

    // Publish for routing engine pickup
    await redis.publish("case:new", JSON.stringify({ caseId: newCase.id }));
    return newCase;
  }

  async transitionStatus(
    caseId: string,
    newStatus: CaseStatus,
    actorId: string,
    version: number
  ) {
    const existing = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
    });

    // Optimistic locking check
    if (existing.version !== version) {
      throw new ConflictError(
        "Case was modified by another user. Please refresh."
      );
    }

    // State machine validation
    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestError(
        `Cannot transition from ${existing.status} to ${newStatus}`
      );
    }

    const updated = await prisma.case.update({
      where: { id: caseId, version }, // Atomic version check
      data: {
        status: newStatus,
        version: { increment: 1 },
        resolvedAt: newStatus === "RESOLVED" ? new Date() : undefined,
        closedAt: newStatus === "CLOSED" ? new Date() : undefined,
        events: {
          create: {
            eventType: "status.changed",
            actorId,
            fromStatus: existing.status,
            toStatus: newStatus,
            payload: {},
          },
        },
      },
    });

    // Real-time event
    await redis.publish(
      "case:status_changed",
      JSON.stringify({
        caseId,
        from: existing.status,
        to: newStatus,
        actorId,
      })
    );

    return updated;
  }
}
```

#### 4.2 Case Number Generation

```typescript
// Auto-incrementing case numbers: CASE-00001, CASE-00002
async generateCaseNumber(): Promise<string> {
  const result = await prisma.$queryRaw<[{nextval: bigint}]>`
    SELECT nextval('case_number_seq')
  `
  return `CASE-${String(result[0].nextval).padStart(5, '0')}`
}
```

Run in migration: `CREATE SEQUENCE case_number_seq START 1;`

#### 4.3 API Routes

```
POST   /api/v1/cases                    → Create case
GET    /api/v1/cases                    → List (scope by role)
GET    /api/v1/cases/:id                → Detail + events
PATCH  /api/v1/cases/:id/status         → Transition status
POST   /api/v1/cases/:id/notes          → Add note
POST   /api/v1/cases/:id/attachments    → Upload attachment (MinIO pre-sign)
POST   /api/v1/cases/:id/tags           → Add tags
```

#### 4.4 Express Router Implementation

```typescript
// apps/api/src/modules/cases/cases.router.ts
import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { CaseService } from "./case.service";

const router = Router();
const service = new CaseService();

// Create — any authenticated user
router.post("/", authenticate, async (req, res) => {
  const newCase = await service.createCase(req.body, req.user!.id);
  res.status(201).json(newCase);
});

// List — scoped by role inside service
router.get("/", authenticate, async (req, res) => {
  const cases = await service.listCases(req.user!, req.query);
  res.json(cases);
});

// Detail + events
router.get("/:id", authenticate, async (req, res) => {
  const c = await service.getCaseById(req.params.id, req.user!);
  if (!c) return res.status(404).json({ error: "Case not found" });
  res.json(c);
});

// Status transition
router.patch("/:id/status", authenticate, async (req, res) => {
  const updated = await service.transitionStatus(
    req.params.id,
    req.body.newStatus,
    req.user!.id,
    req.body.version
  );
  res.json(updated);
});

// Notes
router.post("/:id/notes", authenticate, async (req, res) => {
  const note = await service.addNote(req.params.id, req.body, req.user!.id);
  res.status(201).json(note);
});

// Attachment presign
router.post("/:id/attachments", authenticate, async (req, res) => {
  const result = await service.createUploadUrl(
    req.params.id,
    req.body,
    req.user!.id
  );
  res.json(result);
});

// Tags
router.post("/:id/tags", authenticate, async (req, res) => {
  const updated = await service.addTags(req.params.id, req.body.tags);
  res.json(updated);
});

export { router as casesRouter };
```

**Custom error classes** (required by state machine and optimistic lock):

```typescript
// apps/api/src/lib/errors.ts
export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
export class BadRequestError extends AppError {
  constructor(m: string) {
    super(400, m);
  }
}
export class ConflictError extends AppError {
  constructor(m: string) {
    super(409, m);
  }
}
export class ForbiddenError extends AppError {
  constructor(m: string) {
    super(403, m);
  }
}
export class NotFoundError extends AppError {
  constructor(m: string) {
    super(404, m);
  }
}
// The global error handler in app.ts reads err.statusCode automatically.
```

### Deliverables

- [ ] Full case CRUD working via API
- [ ] Invalid state transitions return 400 with clear message
- [ ] Optimistic locking prevents concurrent edit corruption
- [ ] All transitions recorded in `case_events` table
- [ ] Agents can only see their own assigned cases

---

## Week 5 — Agent Desktop UI & Basic Routing

### Objectives

Build the Agent Desktop frontend and a basic round-robin routing engine so new cases auto-assign to online agents.

### Tasks

#### 5.1 Agent Desktop Layout

```
┌─────────────────────────────────────────────────────┐
│  CCMP  │  My Cases (12)  │  Knowledge Base  │  [👤] │
├─────────┬───────────────────────────────────────────┤
│         │  🔴 HIGH  CASE-00042  Billing dispute     │
│ Queue   │  Customer: Jane Smith   SLA: 45min left   │
│ Count   │  ─────────────────────────────────────── │
│  [24]   │  🟡 MED   CASE-00038  Login issue         │
│         │  Customer: Bob Lee      SLA: 2h left      │
│ Avail:  │  ─────────────────────────────────────── │
│ [●]     │  🟢 LOW   CASE-00031  General inquiry     │
│ Online  │  Customer: Alice Wu     SLA: 4h left      │
└─────────┴───────────────────────────────────────────┘
```

#### 5.2 Case Grid Component (Next.js)

Key features to implement:

- Sort by priority (CRITICAL → LOW)
- Filter by status, priority, SLA risk
- Search by customer name / case number
- SLA countdown badge (updates every 30s via React Query poll)
- Optimistic status update on row action

#### 5.3 Basic Routing Engine (v1)

```python
# apps/routing-service/src/router.py
import asyncio
import redis.asyncio as aioredis
import json

async def process_new_case(case_id: str):
    case = await db.fetch_case(case_id)

    # Step 1: Determine target queue (simple rules for v1)
    queue_id = await evaluate_rules(case)

    # Step 2: Find available agent in queue
    agent_id = await find_available_agent(queue_id)

    if not agent_id:
        # No available agent — leave in queue, notify supervisor
        await redis.publish("queue:backlog", json.dumps({
            "queue_id": queue_id,
            "case_id": case_id
        }))
        return

    # Step 3: Assign
    await db.assign_case(case_id, agent_id, queue_id)
    await redis.publish("case:assigned", json.dumps({
        "case_id": case_id,
        "agent_id": agent_id
    }))

async def find_available_agent(queue_id: str) -> str | None:
    # Get agents in queue, sorted by current workload (ascending)
    agents = await redis.zrange(f"queue:{queue_id}:workload", 0, -1, withscores=True)
    for agent_id, workload in agents:
        presence = await redis.hget(f"agent:{agent_id}", "presence")
        if presence == "ONLINE" and workload < 10:  # Max 10 concurrent cases
            return agent_id.decode()
    return None
```

#### 5.4 Agent Presence (Redis)

```typescript
// Agent connects → set presence
await redis.hset(`agent:${agentId}`, {
  presence: "ONLINE",
  lastSeen: Date.now(),
  currentCases: 0,
});
await redis.expire(`agent:${agentId}`, 300); // 5-min TTL, refreshed by heartbeat

// Heartbeat every 30s from client via WebSocket
// Absence of heartbeat → presence falls to OFFLINE automatically via TTL
```

### Deliverables

- [ ] Agent desktop renders case grid with correct priority order
- [ ] New case created via API auto-assigns to an online agent
- [ ] Agent sees assigned case appear in real-time (Redis pub/sub → WebSocket)
- [ ] Status update from desktop triggers `case_events` record
- [ ] Presence indicator updates when agent changes status

---

## Phase 1 Definition of Done

| Check             | Criteria                                                  |
| ----------------- | --------------------------------------------------------- |
| ✅ Infrastructure | All 8+ Docker services healthy, Traefik routing correctly |
| ✅ Database       | All tables migrated, seed data loaded, indexes verified   |
| ✅ Auth           | All 7 roles working, route protection enforced            |
| ✅ Case CRUD      | Full lifecycle NEW → CLOSED functional via API            |
| ✅ State Machine  | Invalid transitions rejected; all transitions logged      |
| ✅ Routing        | New cases auto-assign to online agents                    |
| ✅ Real-time      | Agent sees case assignment without page refresh           |
| ✅ UI             | Agent desktop grid functional with sort/filter            |

---

## Phase 1 → Phase 2 Handoff Checklist

Before starting Phase 2, confirm:

- [ ] All Prisma migrations are committed and reproducible
- [ ] Docker Compose starts cleanly from a fresh clone (`docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed`)
- [ ] At least one integration test per API route is passing
- [ ] Keycloak realm JSON is committed and auto-imports on container start
- [ ] `.env.example` is accurate and up to date
- [ ] ADR-001 written: Technology stack selection rationale

---

_Phase 1 of 5 · CCMP Implementation Roadmap · Next: [Phase 2 — Core Operations](./Phase-2_Core-Operations.md)_

---

## 🔍 Requirements Audit — Phase 1

### Gap Analysis

| ID    | Severity     | Location    | Issue                                                                                                                | Fix                                                                       |
| ----- | ------------ | ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| G1-01 | 🔴 Critical  | §4.3 / §4.4 | Case router only defined in §4.4 (new); original §4.3 listed routes but had no runnable code                         | **Fixed in §4.4** — Express router with all 7 routes is now explicit      |
| G1-02 | 🔴 Critical  | §4.1        | `ConflictError` and `BadRequestError` referenced but never defined                                                   | **Fixed in §4.4** — `errors.ts` with all custom error classes provided    |
| G1-03 | 🔴 Critical  | §5.3        | Routing engine subscribes to Redis `case:new` but no WebSocket bridge sends the assignment back to the agent browser | **Missing** — Add Redis subscriber → Socket.IO fan-out bridge in `app.ts` |
| G1-04 | 🟡 Important | §4.2        | `CREATE SEQUENCE case_number_seq` mentioned but not in any migration file                                            | **Missing** — Must be added to the initial Prisma migration SQL           |
| G1-05 | 🟡 Important | §5.4        | Heartbeat logic described in prose; no client-side code provided                                                     | **Missing** — Add `usePresenceHeartbeat()` hook in Next.js                |
| G1-06 | 🟡 Important | §3.4        | `next-auth` with Keycloak provider referenced but no `authOptions` config shown                                      | **Missing** — Add `pages/api/auth/[...nextauth].ts` config                |

**Actionable fix for G1-03 — Redis → Socket.IO bridge:**

```typescript
// apps/api/src/realtime/bridge.ts
import { createClient } from "redis";
import { Server as SocketIO } from "socket.io";

export async function startRealtimeBridge(io: SocketIO) {
  const sub = createClient({ url: process.env.REDIS_URL });
  await sub.connect();

  await sub.subscribe(
    [
      "case:assigned",
      "case:status_changed",
      "case:reassigned",
      "sla:warning",
      "sla:breached",
    ],
    (message, channel) => {
      const payload = JSON.parse(message);
      switch (channel) {
        case "case:assigned":
          io.to(`agent:${payload.agent_id}`).emit(channel, payload);
          io.to("supervisors").emit(channel, payload);
          break;
        default:
          io.to(`case:${payload.caseId ?? payload.case_id}`).emit(
            channel,
            payload
          );
      }
    }
  );
}
// Call startRealtimeBridge(io) in index.ts after buildApp()
```

**Actionable fix for G1-05 — Agent heartbeat hook:**

```typescript
// apps/web/src/hooks/usePresenceHeartbeat.ts
import { useEffect } from "react";
import { socket } from "@/lib/socket";

export function usePresenceHeartbeat(
  agentId: string,
  presence: "ONLINE" | "AWAY" | "BUSY"
) {
  useEffect(() => {
    const emit = () => socket.emit("agent:heartbeat", { agentId, presence });
    emit();
    const id = setInterval(emit, 30_000);
    return () => {
      clearInterval(id);
      socket.emit("agent:heartbeat", { agentId, presence: "OFFLINE" });
    };
  }, [agentId, presence]);
}
```

---

## ✅ Phase 1 — Requirement Re-Verification Prompt

> **Instructions:** Before signing off Phase 1 and starting Phase 2, every item below must be ticked by a human or automated test. "Assumed working" is not acceptable.

| #   | Requirement                                               | Verification Method                                                      | Pass? |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| 1   | All 8 Docker services start cleanly from cold             | `docker compose up -d` → all show `healthy` in `docker compose ps`       | ☐     |
| 2   | Traefik routes `/api/*` to Express app                    | `curl -I http://localhost/api/v1/health` returns `HTTP/2 200`            | ☐     |
| 3   | Postgres accessible via PgBouncer on port 6432            | `psql -h localhost -p 6432 -U ccmp_user -d ccmp -c '\dt'` succeeds       | ☐     |
| 4   | All 12 Prisma tables created with correct indexes         | `pnpm prisma studio` — verify tables and indexes                         | ☐     |
| 5   | Seed data loaded (3 queues, SLA policies, 1 routing rule) | `pnpm prisma db seed` exits 0; spot-check rows in Studio                 | ☐     |
| 6   | All 7 Keycloak roles visible in realm                     | Keycloak Admin UI → Realm Roles list                                     | ☐     |
| 7   | Missing `Authorization` header returns 401                | `curl /api/v1/cases` (no token) → `{"error":"Unauthorized"}`             | ☐     |
| 8   | Wrong role returns 403                                    | AGENT token hits supervisor-only route → `{"error":"Forbidden"}`         | ☐     |
| 9   | Valid token attaches `req.user` with correct role         | Unit test on `authenticate` middleware                                   | ☐     |
| 10  | Case creation returns `CASE-00001` format                 | `POST /api/v1/cases` → response `caseNumber` matches `/^CASE-\d{5}$/`    | ☐     |
| 11  | Invalid state transition returns 400                      | `PATCH /:id/status` with `CLOSED→IN_PROGRESS` → `400 Bad Request`        | ☐     |
| 12  | Optimistic lock rejects stale version with 409            | Two simultaneous PATCHes with same `version` → second returns `409`      | ☐     |
| 13  | All transitions recorded in `case_events`                 | After status change, query `case_events` for `status.changed` row        | ☐     |
| 14  | New case publishes to Redis `case:new` channel            | Subscribe in test; create case; verify message arrives                   | ☐     |
| 15  | New case auto-assigns to online agent                     | Set agent presence ONLINE; create case; verify assignment in DB          | ☐     |
| 16  | Agent sees assignment in UI without page refresh          | E2E: create case → agent desktop shows new case row within 2s            | ☐     |
| 17  | Agent presence TTL works: offline after 5-min silence     | Set presence; skip heartbeat 5 min; verify Redis key expired             | ☐     |
| 18  | At least 1 integration test per API route                 | `pnpm test` exits 0 with all route tests listed                          | ☐     |
| 19  | `docker compose up -d` works from fresh clone             | Clone to new dir; `docker compose up -d` → all healthy (no manual steps) | ☐     |
| 20  | ADR-001 committed                                         | `docs/adr/001-tech-stack.md` exists in repo                              | ☐     |

---

_Phase 1 of 5 · CCMP Implementation Roadmap · Express.js migration applied · Requirements audit complete_
