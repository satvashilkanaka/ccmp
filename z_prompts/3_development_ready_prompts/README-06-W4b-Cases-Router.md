# WEEK 4b — Cases Router, Zod Validation & Cursor Pagination
## Sub-Prompt B of 2 · Phase 1 · CCMP

> **Prerequisite:** Week 4a complete. All `case.service.test.ts` tests pass.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 4, Sub-Prompt B. `CaseService` is fully implemented and tested. Now wire it to HTTP routes with proper input validation, auth middleware, and cursor-based pagination.

---

## 📋 TASK

### 1. `apps/api/src/modules/cases/cases.router.ts`

Create an Express Router with these 7 routes — all behind `authenticate` middleware:

| Method | Path | Role Required | Handler |
|--------|------|--------------|---------|
| GET | `/` | Any auth | `listCases(req.user, validatedQuery)` — cursor pagination |
| POST | `/` | Any auth | `createCase(body, req.user.id)` → 201 |
| GET | `/search` | Any auth | Meilisearch search (implement in Week 10 — return 501 stub for now) |
| GET | `/:id` | Any auth | `getCaseById(id, req.user)` |
| PATCH | `/:id/status` | Any auth | `transitionStatus(id, body.newStatus, req.user.id, body.version)` |
| POST | `/:id/notes` | Any auth | Create CaseNote (stub — return 501 for now) |
| GET | `/:id/events` | SUPERVISOR+ | Get case events timeline |

**Cursor pagination for GET `/`:**
```typescript
// Validate query params with ListCasesQuerySchema
const query = ListCasesQuerySchema.parse(req.query);
const result = await caseService.listCases(req.user!, query);
res.json({
  items: result.items,
  pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore, limit: query.limit },
});
```

### 2. Register router in `apps/api/src/app.ts`

Add to `buildApp()` after the health route:
```typescript
import { casesRouter } from './modules/cases/cases.router';
// ...
app.use('/api/v1/cases', casesRouter);
```

### 3. Integration tests: `apps/api/src/__tests__/cases.router.test.ts`

Write Vitest + supertest tests:
- `POST /api/v1/cases` without auth → 401
- `POST /api/v1/cases` with valid AGENT token + valid body → 201, caseNumber matches `/^CASE-\d{5}$/`
- `POST /api/v1/cases` with missing `subject` → 400, `fields.subject` present in response
- `GET /api/v1/cases?limit=5` → 200, returns `{ items, pagination }`
- `GET /api/v1/cases?limit=5&cursor=<nextCursor>` → next page, no duplicates
- `GET /api/v1/cases?limit=200` → capped at 100 (Zod coercion)
- `PATCH /api/v1/cases/:id/status` with stale version → 409

---

## ⚙️ CONSTRAINTS

- All POST/PATCH routes: `validateBody(schema)` middleware **before** handler
- Cursor param: parse as string (CUID format), never as integer
- `GET /cases?limit=200` must be capped at 100 by Zod schema — not silently
- All routes behind `authenticate` middleware (imported from `../../middleware/auth`)
- `PATCH /:id/status` must use `UpdateStatusSchema` for validation
- `GET /:id/events` behind `requireRole(['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN'])`

---

## 📤 OUTPUT

1. `apps/api/src/modules/cases/cases.router.ts` (7 routes)
2. Updated `apps/api/src/app.ts` (router registered)
3. `apps/api/src/__tests__/cases.router.test.ts`

---

## ✅ VERIFICATION STEP

```bash
# 1. Start API
pnpm --filter @ccmp/api dev &
sleep 3

# 2. No auth → 401
curl -s -X POST http://localhost:4000/api/v1/cases \
  -H "Content-Type: application/json" \
  -d '{"subject":"test"}' | jq .
# EXPECT: {"error":"Unauthorized"}

# 3. Valid token, valid body → 201
TOKEN="<your-keycloak-token>"
curl -s -X POST http://localhost:4000/api/v1/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Test Case","channel":"EMAIL","priority":"MEDIUM"}' | jq .
# EXPECT: {"id":"...","caseNumber":"CASE-00001",...}

# 4. Missing subject → 400
curl -s -X POST http://localhost:4000/api/v1/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"EMAIL"}' | jq .
# EXPECT: {"error":"Validation failed","fields":{"subject":[...]}}

# 5. Concurrent status update → 409
ID="<case-id-from-step-3>"
curl -s -X PATCH http://localhost:4000/api/v1/cases/$ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newStatus":"ASSIGNED","version":1}' | jq .
# Run same command again immediately:
curl -s -X PATCH http://localhost:4000/api/v1/cases/$ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newStatus":"ASSIGNED","version":1}' | jq .
# EXPECT: 409 {"error":"Case was modified by another user..."}

git add . && git commit -m "feat: week-4b cases router complete"
```

**Next:** `README-07-W5-Agent-Desktop.md`
