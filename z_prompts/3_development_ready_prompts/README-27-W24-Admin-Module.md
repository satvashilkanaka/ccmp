# WEEK 24 — Admin Module

## Routing Rules + SLA Policies + User Management + System Health · Phase 5 · CCMP

> **Prerequisite:** Week 23 complete. Security hardening verified.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **`apps/api/src/modules/admin/admin.service.ts`** — implement 12 methods:

   - Routing rules: `createRoutingRule()`, `updateRoutingRule()`, `deleteRoutingRule()`, `reorderRoutingRules()`, `dryRunRoutingRules()`
   - SLA policies: `createSlaPolicy()`, `updateSlaPolicy()`
   - User management: `listUsers()`, `createUser()`, `updateUser()`, `deactivateUser()` (soft-delete only — `isActive: false, deletedAt: now()`)
   - System health: `getSystemHealth()` — use `Promise.allSettled` (never `Promise.all`)

2. **`apps/api/src/modules/admin/admin.router.ts`** — 12 routes, all behind `requireRole([ADMIN])` except routing rule read/dry-run which allows `[SUPERVISOR]`.

3. **`apps/api/src/middleware/adminAudit.ts`** — audit middleware wired on admin router:

   ```typescript
   app.use("/api/v1/admin", adminAuditMiddleware, adminRouter);
   // Uses res.on('finish') to log after response
   // Only logs mutations (POST, PATCH, PUT, DELETE) — not reads
   ```

4. **`dryRunRoutingRules(hypotheticalCase)`** — evaluates against all active rules in `priorityOrder ASC` (first match wins). Returns:

   ```json
   { "matchedRule": "Spanish Support Rule", "actions": {...}, "confidence": "exact_match" }
   ```

5. **Cache invalidation** — after `createRoutingRule`/`updateRoutingRule`/`deleteRoutingRule`/`reorderRoutingRules`: delete `RedisKeys.routingRules()` and `RedisKeys.routingRuleHash()`.

6. **Admin UI pages** in `apps/web/src/app/(admin)/`:
   - `routing-rules/page.tsx` — drag-drop priority reorder list
   - `sla-policies/page.tsx` — editable table
   - `users/page.tsx` — user table with role change dropdown
   - `system/page.tsx` — health status grid

---

## ⚙️ CONSTRAINTS

- `reorderRoutingRules`: `prisma.$transaction` for atomic reorder
- `deactivateUser`: soft-delete ONLY — `isActive: false, deletedAt: now()` — never hard-delete
- `getSystemHealth`: `Promise.allSettled` — partial failures must not crash the response
- All admin mutation routes: `validateBody(schema)` middleware with Zod schemas
- `adminAuditMiddleware`: check `req.method` — only log POST/PATCH/PUT/DELETE

---

## ✅ VERIFICATION STEP

```bash
# Create routing rule
curl -s -X POST http://localhost:4000/api/v1/admin/routing-rules \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"VIP Rule","conditions":{"priority":"CRITICAL"},"actions":{"assignToQueue":"VIP"},"priorityOrder":1}' | jq .
# EXPECT: Rule created. Redis routing:rules:active key deleted.

# Dry run
curl -s -X POST http://localhost:4000/api/v1/admin/routing-rules/dry-run \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority":"CRITICAL"}' | jq .
# EXPECT: {"matchedRule":"VIP Rule","confidence":"exact_match"}

git add .; git commit -m "feat: week-24 admin module complete"
```

**Next:** `README-28-W25-Notifications.md`
