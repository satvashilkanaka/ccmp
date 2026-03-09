# WEEK 10 — Chat Intake & Meilisearch
## Authenticated Socket.IO + Full-Text Search · Phase 2 · CCMP

> **Prerequisite:** Week 9 complete. Supervisor dashboard live.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- Socket.IO auth middleware in `apps/api/src/index.ts`: `io.use(async (socket, next) => { verify token from socket.handshake.auth.token; attach socket.data.user; call next() or next(new Error("Unauthorized")) })`
- `apps/api/src/modules/chat/chat.gateway.ts` — handle: `chat:start` (create CHAT case, join room, publish `case:new`), `chat:message` (create CaseNote, fan-out to room), `chat:end` (transition to RESOLVED).
- `packages/database/src/search/meilisearch.ts` — `setupIndexes()` with searchable/filterable attributes. `indexCase()` called after every case write. `deleteIndex()` for soft-deleted cases.
- `GET /api/v1/cases/search?q=&filter=&sort=` in `cases.router.ts` — role-scoped filter prepended automatically.
- `apps/web/src/components/SearchBar.tsx` — debounced 300ms, min 2 chars, keyboard-navigable dropdown with highlighted results.
**Constraints:**
- Socket.IO auth: if token missing/invalid → `next(new Error("Unauthorized"))` (triggers client disconnect)
- Chat case creation: validate `customerEmail` with Zod
- All Meilisearch operations in try/catch — Meili down must NOT block case creation
- Search role-scoping: AGENT gets `assignedTo = ${userId}` filter prepended

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w10 chat search complete"
```

**Next:** `README-14-W11-Integration-Tests.md`
