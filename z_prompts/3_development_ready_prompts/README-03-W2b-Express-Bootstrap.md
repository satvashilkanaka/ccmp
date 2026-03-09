# WEEK 2b — Express.js Server Bootstrap & Database Seed
## Sub-Prompt B of 2 · Phase 1 · CCMP

> **Prerequisite:** Week 2a complete. Prisma schema migrated. `pnpm prisma validate` passes. Sequence `case_number_seq` exists.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 2, Sub-Prompt B. Prisma schema is migrated and validated. Now build the Express.js API server skeleton and seed the database with initial operational data.

The server must be production-shaped from day one: structured logging, async error handling, health endpoint, and Socket.IO attached correctly.

---

## 📋 TASK

### 1. `apps/api/package.json`

```json
{
  "name": "@ccmp/api",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.0",
    "express-async-errors": "^3.1.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.3.0",
    "rate-limit-redis": "^4.2.0",
    "pino": "^9.2.0",
    "pino-http": "^10.2.0",
    "jsonwebtoken": "^9.0.2",
    "jwks-rsa": "^3.1.0",
    "socket.io": "^4.7.5",
    "@socket.io/redis-adapter": "^8.3.0",
    "redis": "^4.6.14",
    "bullmq": "^5.7.0",
    "zod": "^3.23.0",
    "opossum": "^8.1.0",
    "csv-stringify": "^6.5.0",
    "swagger-ui-express": "^5.0.1",
    "swagger-jsdoc": "^6.2.8",
    "@ccmp/database": "workspace:*",
    "@ccmp/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/swagger-ui-express": "^4.1.6",
    "@types/swagger-jsdoc": "^6.0.4",
    "@types/opossum": "^8.1.4",
    "tsx": "^4.15.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

### 2. `apps/api/src/lib/errors.ts`

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request') { super(400, message); }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message); }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') { super(404, message); }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') { super(409, message); }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable Entity') { super(422, message); }
}
```

### 3. `apps/api/src/middleware/validate.ts`

```typescript
import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten();
      res.status(400).json({
        error: 'Validation failed',
        fields: errors.fieldErrors,
        form: errors.formErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid query parameters', fields: result.error.flatten().fieldErrors });
      return;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}
```

### 4. `apps/api/src/app.ts`

```typescript
import 'express-async-errors'; // MUST BE FIRST IMPORT
import express, { Application, Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { AppError } from './lib/errors';

export function buildApp(): Application {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Health ──────────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString(), version: process.env.npm_package_version });
  });

  // ── Routes (registered in index.ts after buildApp) ──────────────────────
  // app.use('/api/v1/cases', casesRouter);  ← added in Week 4

  // ── 404 handler ─────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // ── Global error handler ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');

    // Handle circuit breaker open state (added Week 22)
    if (err.constructor?.name === 'OpenCircuitError') {
      res.status(503).json({ error: 'Service temporarily unavailable — circuit open' });
      return;
    }

    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    // Prisma errors
    if ((err as any).code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if ((err as any).code === 'P2002') {
      res.status(409).json({ error: 'Resource already exists' });
      return;
    }

    res.status(500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    });
  });

  return app;
}
```

### 5. `apps/api/src/lib/logger.ts`

```typescript
import pino from 'pino';

// PII scrubbing serialiser
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // email
  /\b\d{16}\b/g,         // credit card
  /\+?[\d\s\-().]{10,}/g, // phone
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
];

function scrubPii(value: string): string {
  let result = value;
  PII_PATTERNS.forEach(pattern => { result = result.replace(pattern, '[REDACTED]'); });
  return result;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  formatters: {
    log: (obj) => {
      const str = JSON.stringify(obj);
      return JSON.parse(scrubPii(str));
    },
  },
});
```

### 6. `apps/api/src/index.ts`

```typescript
import 'express-async-errors'; // MUST BE ABSOLUTE FIRST IMPORT
import http from 'http';
import { createClient } from 'redis';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { buildApp } from './app';
import { logger } from './lib/logger';

const PORT = parseInt(process.env.API_PORT || '4000', 10);

async function main() {
  const app = buildApp();
  const httpServer = http.createServer(app);

  // ── Redis clients for Socket.IO adapter ────────────────────────────────
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  // ── Socket.IO ───────────────────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'], methods: ['GET', 'POST'] },
    adapter: createAdapter(pubClient, subClient),
  });

  // Socket.IO auth middleware (Week 10 adds full implementation)
  io.use((_socket, next) => next());

  // Export io for use in other modules
  (global as any).__io = io;

  // ── Start server ─────────────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, '🚀 CCMP API started');
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    httpServer.close(async () => {
      logger.info('HTTP server closed');
      await pubClient.quit();
      await subClient.quit();
      process.exit(0);
    });
    // Force exit after 30s
    setTimeout(() => process.exit(1), 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, httpServer, io };
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
```

### 7. `packages/database/prisma/seed.ts`

```typescript
import { PrismaClient, CasePriority, CaseChannel } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Queues
  const queues = await Promise.all([
    prisma.queue.upsert({
      where: { name: 'General Support' },
      update: {},
      create: { name: 'General Support', description: 'Default inbound queue', isActive: true },
    }),
    prisma.queue.upsert({
      where: { name: 'Billing' },
      update: {},
      create: { name: 'Billing', description: 'Billing and payments', isActive: true },
    }),
    prisma.queue.upsert({
      where: { name: 'Technical Support' },
      update: {},
      create: { name: 'Technical Support', description: 'Technical escalations', isActive: true },
    }),
  ]);
  console.log(`✅ ${queues.length} queues seeded`);

  // SLA Policies — all priority × channel combos
  const priorities: CasePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const channels: CaseChannel[] = ['PHONE', 'EMAIL'];
  const slaTimes = {
    LOW:      { response: 480, resolution: 2880 }, // 8h / 48h
    MEDIUM:   { response: 240, resolution: 1440 }, // 4h / 24h
    HIGH:     { response: 60,  resolution: 480  }, // 1h / 8h
    CRITICAL: { response: 15,  resolution: 120  }, // 15m / 2h
  };

  for (const priority of priorities) {
    for (const channel of channels) {
      await prisma.slaPolicy.upsert({
        where: { priority_channel: { priority, channel } },
        update: {},
        create: {
          name: `${priority} ${channel}`,
          priority,
          channel,
          responseTimeMinutes: slaTimes[priority].response,
          resolutionTimeMinutes: slaTimes[priority].resolution,
          warningThresholdPct: 0.8,
          isActive: true,
        },
      });
    }
  }
  console.log('✅ SLA policies seeded');

  // Default routing rule
  await prisma.routingRule.upsert({
    where: { id: 'default-catchall' },
    update: {},
    create: {
      id: 'default-catchall',
      name: 'Default Catch-All',
      conditions: {},
      actions: { assignToQueue: 'General Support' },
      priorityOrder: 9999,
      isActive: true,
    },
  });
  console.log('✅ Default routing rule seeded');

  console.log('🎉 Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### 8. `packages/shared/src/permissions.ts`

```typescript
export const ROLE_PERMISSIONS = {
  AGENT: [
    'case:read:own', 'case:create', 'case:update:own', 'note:create',
    'attachment:upload', 'presence:update', 'kb:read',
  ],
  SENIOR_AGENT: [
    'case:read:own', 'case:read:team', 'case:create', 'case:update:own',
    'note:create', 'attachment:upload', 'presence:update', 'kb:read',
  ],
  SUPERVISOR: [
    'case:read:all', 'case:create', 'case:update:all', 'case:reassign',
    'case:escalate', 'case:sla:override', 'note:create', 'attachment:upload',
    'presence:update', 'kb:read', 'kb:write', 'queue:read', 'routing:read',
    'routing:dry-run', 'reports:read',
  ],
  QA_ANALYST: [
    'case:read:all', 'qa:read', 'qa:write', 'recording:playback',
    'audit:read', 'kb:read',
  ],
  OPERATIONS_MANAGER: [
    'case:read:all', 'case:update:all', 'case:reassign', 'case:escalate',
    'reports:read', 'reports:export', 'queue:read', 'sla:read', 'kb:read', 'kb:write',
  ],
  COMPLIANCE_OFFICER: [
    'audit:read', 'audit:export', 'case:read:all', 'recording:playback',
    'compliance:read',
  ],
  ADMIN: ['*'], // wildcard — all permissions
} as const;

export type UserRole = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] as readonly string[];
  return perms.includes('*') || perms.includes(permission);
}
```

---

## ⚙️ CONSTRAINTS

- `import 'express-async-errors'` must be the **ABSOLUTE FIRST LINE** of both `app.ts` and `index.ts`
- `AppError` subclasses must set `this.name = this.constructor.name` for correct Pino serialisation
- Socket.IO must attach to `httpServer` (the result of `http.createServer(app)`) — **never to `app` directly**
- Redis pub/sub clients: use `pubClient.duplicate()` for the sub client
- Seed must be idempotent — use `upsert` everywhere, never `create`
- Prisma soft-delete middleware in `packages/database/src/index.ts` from Week 2a must remain unchanged

---

## 📤 OUTPUT

1. `apps/api/package.json`
2. `apps/api/src/lib/errors.ts` (6 error classes)
3. `apps/api/src/middleware/validate.ts` (validateBody + validateQuery)
4. `apps/api/src/app.ts` (buildApp with global error handler)
5. `apps/api/src/lib/logger.ts` (pino with PII scrubbing)
6. `apps/api/src/index.ts` (entry point with Socket.IO + graceful shutdown)
7. `packages/database/prisma/seed.ts` (idempotent, all seed data)
8. `packages/shared/src/permissions.ts`

---

## ✅ VERIFICATION STEP

```bash
# 1. Install dependencies
pnpm install

# 2. Run seed (twice — idempotency check)
pnpm --filter @ccmp/database prisma db seed
pnpm --filter @ccmp/database prisma db seed
# EXPECT: Both runs exit 0, no duplicate key errors

# 3. Start API server
pnpm --filter @ccmp/api dev &
sleep 3

# 4. Health check
curl -s http://localhost:4000/health | jq .
# EXPECT: {"status":"ok","ts":"..."}

# 5. 404 check
curl -s http://localhost:4000/nonexistent | jq .
# EXPECT: {"error":"Not Found"}

# 6. Stop server (Ctrl+C or kill)

# 7. Commit
git add . && git commit -m "feat: week-2b express bootstrap complete"
```

**Next:** `README-04-W3-Auth-Middleware.md`
