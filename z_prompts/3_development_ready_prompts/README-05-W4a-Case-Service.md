# WEEK 4a — Case Service & State Machine
## Sub-Prompt A of 2 · Phase 1 · CCMP

> **Prerequisite:** Week 3 complete. `authenticate` middleware passes verification tests.
> **Complete this before Week 4b.**
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 4, Sub-Prompt A. Auth middleware is working. Now implement `CaseService` — the core business logic class. This must be fully implemented and unit-tested **before** adding HTTP routes in Week 4b.

The state machine and optimistic locking are critical correctness properties. Get them right here.

---

## 📋 TASK

### 1. `apps/api/src/modules/cases/case.service.ts`

Implement a `CaseService` class with these methods:

#### State Machine (define as top-level const, not inside the class)
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW:                  ['ASSIGNED', 'CLOSED'],
  ASSIGNED:             ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED', 'CLOSED'],
  IN_PROGRESS:          ['WAITING_ON_CUSTOMER', 'ESCALATED', 'PENDING_CLOSURE', 'RESOLVED'],
  WAITING_ON_CUSTOMER:  ['IN_PROGRESS', 'ESCALATED', 'RESOLVED'],
  ESCALATED:            ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  PENDING_CLOSURE:      ['RESOLVED', 'CLOSED'],
  RESOLVED:             ['CLOSED'],
  CLOSED:               [],
};
```

#### `generateCaseNumber(): Promise<string>`
```typescript
// Use raw SQL to get next sequence value
const result = await prismaWrite.$queryRaw<[{ nextval: bigint }]>`
  SELECT nextval('case_number_seq')
`;
return 'CASE-' + String(result[0].nextval).padStart(5, '0');
```

#### `createCase(data: CreateCaseDto, actorId: string): Promise<Case>`
- Look up SLA policy by `data.priority` and `data.channel`
- Calculate `slaDueAt` = now + `slaPolicy.resolutionTimeMinutes`
- Use `prisma.$transaction([...])` to atomically:
  1. Create the Case record with generated case number
  2. Create a `CaseEvent` with `eventType: 'case.created'`, `payload: { subject, channel, priority }`, `actorId`
- After transaction: publish to Redis channel `case:new` with `{ caseId, queueId, priority, channel }`
- Return the created case

#### `transitionStatus(caseId, newStatus, actorId, version): Promise<Case>`
- Fetch the case (throw `NotFoundError` if not found)
- Check `VALID_TRANSITIONS[current.status].includes(newStatus)` — throw `BadRequestError` if invalid
- Use `prisma.case.updateMany({ where: { id: caseId, version: version }, data: { status: newStatus, version: { increment: 1 } } })`
- If `count === 0`: throw `ConflictError('Case was modified by another user — please refresh')`
- After update: create `CaseEvent` with `eventType: 'case.status_changed'`, publish to Redis `case:status_changed`
- Return updated case

#### `listCases(user: AuthUser, query: ListCasesQuery): Promise<PaginatedResult<Case>>`
- Build Prisma `where` clause based on role:
  - `AGENT`: `{ assignedToId: user.id }`
  - `SENIOR_AGENT`: `{ OR: [{ assignedToId: user.id }, { teamId: user.teamId }] }`
  - `SUPERVISOR`, `OPERATIONS_MANAGER`, `ADMIN`: no additional filter
  - `QA_ANALYST`, `COMPLIANCE_OFFICER`: all cases
- Apply cursor pagination: if `query.cursor` provided, add `cursor: { id: query.cursor }, skip: 1`
- Fetch `take + 1` items, return `{ items: items.slice(0, take), nextCursor: items[take]?.id, hasMore: items.length > take }`

#### `getCaseById(caseId: string, user: AuthUser): Promise<Case>`
- Fetch with all relations
- Enforce read access: AGENT can only see own cases, others see all
- Throw `NotFoundError` or `ForbiddenError` as appropriate

### 2. DTOs and types in `apps/api/src/modules/cases/case.dto.ts`

```typescript
import { z } from 'zod';
import { CaseChannel, CasePriority } from '@ccmp/database';

export const CreateCaseSchema = z.object({
  subject: z.string().min(3).max(255),
  description: z.string().optional(),
  channel: z.nativeEnum(CaseChannel),
  priority: z.nativeEnum(CasePriority).default('MEDIUM'),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  queueId: z.string().cuid().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const UpdateStatusSchema = z.object({
  newStatus: z.enum(['NEW','ASSIGNED','IN_PROGRESS','WAITING_ON_CUSTOMER','ESCALATED','PENDING_CLOSURE','RESOLVED','CLOSED']),
  version: z.number().int().positive(),
  reason: z.string().optional(),
});

export const ListCasesQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['NEW','ASSIGNED','IN_PROGRESS','WAITING_ON_CUSTOMER','ESCALATED','PENDING_CLOSURE','RESOLVED','CLOSED']).optional(),
  priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(),
  channel: z.enum(['PHONE','EMAIL','CHAT','SOCIAL','WALK_IN']).optional(),
});

export type CreateCaseDto = z.infer<typeof CreateCaseSchema>;
export type UpdateStatusDto = z.infer<typeof UpdateStatusSchema>;
export type ListCasesQuery = z.infer<typeof ListCasesQuerySchema>;
```

### 3. Unit tests: `apps/api/src/__tests__/case.service.test.ts`

Write Vitest unit tests covering:
- All 22 valid status transitions succeed
- All invalid transitions throw `BadRequestError` with message naming the invalid transition
- `generateCaseNumber()` returns format matching `/^CASE-\d{5}$/`
- Concurrent `transitionStatus` with same version: second call throws `ConflictError`
- `listCases` for AGENT role only returns own cases

---

## ⚙️ CONSTRAINTS

- `VALID_TRANSITIONS` must be a **top-level const** — not inside the class or any function
- `prisma.$transaction([...])` required for case creation (case + event must be atomic)
- `generateCaseNumber` must handle BigInt: `String(result[0].nextval)` before `.padStart()`
- Optimistic lock uses `updateMany` (not `update`) with `where: { id, version }` — check `count === 0`
- Redis publish happens **after** the transaction commits — never inside the transaction
- Role scoping in `listCases`: never expose another agent's cases to an AGENT-role user

---

## 📤 OUTPUT

1. `apps/api/src/modules/cases/case.service.ts` (all 5 methods)
2. `apps/api/src/modules/cases/case.dto.ts` (Zod schemas + types)
3. `apps/api/src/__tests__/case.service.test.ts` (unit tests)

---

## ✅ VERIFICATION STEP

```bash
# 1. Run unit tests
pnpm --filter @ccmp/api test case.service

# EXPECT: All tests pass including:
# ✓ should create a case with correct case number format
# ✓ should transition NEW → ASSIGNED successfully
# ✓ should throw BadRequestError for NEW → CLOSED
# ✓ should throw ConflictError on stale version
# ✓ AGENT role only sees own cases in listCases

# 2. Check all 22 valid transitions are tested
grep "VALID_TRANSITIONS" apps/api/src/modules/cases/case.service.ts
# EXPECT: defined as top-level const

git add . && git commit -m "feat: week-4a case service and state machine"
```

**Next:** `README-06-W4b-Cases-Router.md`
