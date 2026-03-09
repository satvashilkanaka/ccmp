# WEEK 2a — Database Schema & Prisma Migrations
## Sub-Prompt A of 2 · Phase 1 · CCMP

> **Prerequisite:** Week 1 complete. All Docker services are healthy (`docker compose ps` shows all green).
> **Complete this before Week 2b.**
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 2, Sub-Prompt A. The Docker Compose stack is healthy. Now create the complete Prisma database schema — all 15 models, all enums, all indexes, and run the initial migration. No application server code yet — database schema only.

The schema is the most critical deliverable in Phase 1. Mistakes are expensive to fix post-migration. Get it right here.

---

## 📋 TASK

### 1. `packages/database/package.json`

```json
{
  "name": "@ccmp/database",
  "version": "1.0.0",
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.15.0",
    "prisma": "^5.15.0"
  },
  "devDependencies": {
    "tsx": "^4.15.0",
    "typescript": "^5.4.0"
  }
}
```

### 2. `packages/database/prisma/schema.prisma`

Create the complete schema with these models. Use `@map()` for all field names to snake_case. All relations must have explicit `onDelete`.

**Enums:**
```prisma
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
  PENDING_CLOSURE
  RESOLVED
  CLOSED
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
  SOCIAL
  WALK_IN
}

enum AgentPresence {
  ONLINE
  BUSY
  AWAY
  OFFLINE
}
```

**Models (all fields required unless marked optional):**

- **`User`**: id (cuid), email (unique), firstName, lastName, role (UserRole), teamId (optional), isActive (default true), deletedAt (optional DateTime), createdAt, updatedAt. Relations: team (Team?), cases (Case[]), events (CaseEvent[]), qaReviews (QaReview[]).

- **`Team`**: id, name (unique), description (optional), supervisorId (optional), createdAt, updatedAt. Relations: members (User[]), cases (Case[]).

- **`Case`**: id (cuid), caseNumber (unique), subject, description (optional), status (CaseStatus default NEW), priority (CasePriority default MEDIUM), channel (CaseChannel), customerId (optional), customerEmail (optional), customerPhone (optional), assignedToId (optional), teamId (optional), queueId (optional), slaPolicyId (optional), slaDueAt (optional DateTime), slaBreachedAt (optional DateTime), metadata (Json default {}), version (Int default 1), deletedAt (optional DateTime), createdAt, updatedAt. Relations: assignedTo (User?), team (Team?), queue (Queue?), slaPolicy (SlaPolicy?), events (CaseEvent[]), notes (CaseNote[]), attachments (Attachment[]), recordings (Recording[]), qaReviews (QaReview[]).

- **`CaseEvent`**: id (cuid), caseId, eventType (String), payload (Json default {}), actorId (optional), createdAt. Relations: case (Case onDelete Cascade), actor (User?).

- **`CaseNote`**: id, caseId, content, authorId, isInternal (default false), createdAt, updatedAt. Relations: case (Case onDelete Cascade), author (User onDelete Restrict).

- **`Attachment`**: id, caseId, filename, mimeType, sizeBytes (Int), storageKey, uploadedById, createdAt. Relations: case (Case onDelete Cascade), uploadedBy (User onDelete Restrict).

- **`Queue`**: id, name (unique), description (optional), isActive (default true), createdAt, updatedAt. Relations: cases (Case[]).

- **`SlaPolicy`**: id, name, priority (CasePriority), channel (CaseChannel), responseTimeMinutes (Int), resolutionTimeMinutes (Int), warningThresholdPct (Float default 0.8), isActive (default true), createdAt, updatedAt. Add `@@unique([priority, channel])`.

- **`RoutingRule`**: id, name, conditions (Json), actions (Json), priorityOrder (Int), isActive (default true), createdAt, updatedAt.

- **`Recording`**: id, caseId, callUuid (unique), filename, storageKey, durationSeconds (optional Int), fileSizeBytes (optional Int), encryptionAlgorithm (default "AES256"), isPaused (default false), retentionExpiresAt (optional DateTime), createdAt, updatedAt. Relations: case (Case onDelete Restrict).

- **`QaReview`**: id, caseId, reviewerId, scores (Json), totalScore (Float), complianceFlags (String[] default []), coachingNotes (optional), reviewedAt (DateTime default now()). Relations: case (Case onDelete Restrict), reviewer (User onDelete Restrict).

- **`AuditLog`**: id, actorId (optional), actorEmail (optional), action, resourceType, resourceId (optional), payload (Json default {}), ipAddress (optional), userAgent (optional), createdAt. **No updatedAt** — this is append-only.

- **`CsatResponse`**: id, caseId (unique — one per case), token (unique), score (Int — 1-5), feedback (optional), submittedAt (optional DateTime), expiresAt, createdAt. Relations: case (Case onDelete Cascade).

- **`KbArticle`**: id, title, content, category, tags (String[] default []), authorId, viewCount (Int default 0), isPublished (default false), publishedAt (optional DateTime), createdAt, updatedAt. Relations: author (User onDelete Restrict).

- **`NotificationPreference`**: id, userId (unique), emailOnAssign (default true), emailOnSlaWarning (default true), emailOnSlaBreach (default true), emailOnQaReview (default false), emailDailySummary (default true), createdAt, updatedAt. Relations: user (User onDelete Cascade).

**Generator:**
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 3. Run the migration

After generating the schema, the AI should provide the command:
```bash
pnpm --filter @ccmp/database prisma migrate dev --name initial_schema
```

### 4. Add sequence to migration SQL

After the migration file is created, open the generated migration SQL file at `packages/database/prisma/migrations/*/migration.sql` and **add this line** at the top, before the CREATE TABLE statements:

```sql
CREATE SEQUENCE IF NOT EXISTS case_number_seq START 1 INCREMENT 1;
```

Then run a second migration for the audit log immutability trigger:
```bash
pnpm --filter @ccmp/database prisma migrate dev --name audit_log_immutability
```

The content of that migration SQL should be:
```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

### 5. `packages/database/src/index.ts`

```typescript
import { PrismaClient } from '../generated/client';

const globalForPrisma = globalThis as unknown as {
  prismaWrite: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
};

export const prismaWrite = globalForPrisma.prismaWrite ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export const prismaRead = globalForPrisma.prismaRead ?? new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_URL || process.env.DATABASE_URL } },
  log: ['error'],
});

// Soft-delete middleware — auto-filter deletedAt records
prismaWrite.$use(async (params, next) => {
  if (['findMany', 'findFirst', 'findUnique'].includes(params.action ?? '')) {
    if (params.model === 'Case' || params.model === 'User') {
      params.args = params.args ?? {};
      params.args.where = { ...params.args.where, deletedAt: null };
    }
  }
  return next(params);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaWrite = prismaWrite;
  globalForPrisma.prismaRead = prismaRead;
}

export * from '../generated/client';
```

---

## ⚙️ CONSTRAINTS

- All DateTime fields use `@default(now())` or `@updatedAt` — never set in application code
- All field names use `@map()` to snake_case for PostgreSQL convention (e.g., `caseNumber @map("case_number")`)
- All relations must have explicit `onDelete` (Cascade or Restrict — never default)
- `SlaPolicy` must have `@@unique([priority, channel])` compound unique constraint
- `AuditLog` has NO `updatedAt` field — it is append-only by design
- The soft-delete Prisma middleware must be applied to `prismaWrite` only, not `prismaRead`
- Strict TypeScript — no `any` types anywhere

---

## 📤 OUTPUT

1. `packages/database/package.json`
2. `packages/database/prisma/schema.prisma` (complete, all 15 models)
3. Migration file with `case_number_seq` sequence added
4. Second migration with audit log immutability trigger
5. `packages/database/src/index.ts` (prismaWrite + prismaRead + soft-delete middleware)

---

## ✅ VERIFICATION STEP

```bash
# 1. Run migrations
pnpm --filter @ccmp/database prisma migrate dev

# 2. Count tables
docker exec ccmp-postgres psql -U ccmp_user -d ccmp -c "\dt" | wc -l
# EXPECT: at least 17 lines (15 tables + headers)

# 3. Test sequence exists
docker exec ccmp-postgres psql -U ccmp_user -d ccmp -c "SELECT nextval('case_number_seq')"
# EXPECT: returns 1

# 4. Test audit log immutability
docker exec ccmp-postgres psql -U ccmp_user -d ccmp \
  -c "INSERT INTO audit_logs (id, action, resource_type, created_at) VALUES ('test-1', 'test', 'test', now()); UPDATE audit_logs SET action='x' WHERE id='test-1';" 2>&1
# EXPECT: ERROR: Audit logs are immutable and cannot be modified or deleted

# 5. Validate schema
pnpm --filter @ccmp/database prisma validate && echo "✅ Schema valid"

# 6. Commit
git add . && git commit -m "feat: week-2a database schema complete"
```

**Next:** `README-03-W2b-Express-Bootstrap.md`
