# WEEK 18 — Database Optimization

## Indexes + Partitioning + Read Replica · Phase 4 · CCMP

> **Prerequisite:** Week 17 complete. Phase 3 fully functional with observability stack running.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Goal:** Prove performance improvements with metrics — not assertions.

1. **Enable `pg_stat_statements`** and query top 10 slowest queries. Commit as `docs/performance/baseline-queries.md`.

2. **Add 5 partial indexes** using `CREATE INDEX CONCURRENTLY` (must NOT be inside a transaction block):

   - `idx_cases_agent_active` ON cases(assigned_to_id) WHERE deleted_at IS NULL AND status NOT IN ('RESOLVED','CLOSED')
   - `idx_cases_sla_active` ON cases(sla_due_at) WHERE status NOT IN ('RESOLVED','CLOSED')
   - `idx_cases_metadata_gin` ON cases USING GIN(metadata)
   - `idx_audit_actor_ts` ON audit_logs(actor_id, created_at DESC)
   - `idx_case_events_type_ts` ON case_events(case_id, event_type, created_at DESC)

3. **Add read replica** to `docker-compose.yml`: `postgres-replica` with streaming replication. Update `packages/database/src/index.ts`: `prismaRead` points to `DATABASE_READ_URL`.

4. **PgBouncer config**: `config/pgbouncer/pgbouncer.ini` with `pool_mode=transaction`, `max_client_conn=500`, `default_pool_size=20`.

5. **Update all report queries** to use `prismaRead`. Add `/* read-replica */` comment to each.

6. **Partition migration script**: `scripts/migrate-to-partitioned.sh` — convert cases and audit_logs to monthly range partitions. Process in batches of 10k rows.

7. **Replica lag endpoint**: `GET /api/v1/admin/replica-lag` returning `SELECT now() - pg_last_xact_replay_timestamp()`.

---

## ⚙️ CONSTRAINTS

- `CREATE INDEX CONCURRENTLY` — standalone statement, never in a transaction
- PgBouncer: never use session `pool_mode` when LISTEN/NOTIFY is active — use direct connections for subscriptions
- Partition migration: test on copy first, never run on production without backup
- `pg_partman`: `premake: 3`, `retention: "24 months"`

---

## ✅ VERIFICATION STEP

```bash
# 1. Verify indexes
docker exec ccmp-postgres psql -U ccmp_user -d ccmp \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='cases' AND indexname LIKE 'idx_%'"
# EXPECT: 5 rows

# 2. Replica lag
curl -s http://localhost:4000/api/v1/admin/replica-lag \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
# EXPECT: lag < 100ms

# 3. EXPLAIN ANALYZE on case list
docker exec ccmp-postgres psql -U ccmp_user -d ccmp \
  -c "EXPLAIN ANALYZE SELECT * FROM cases WHERE assigned_to_id='test' AND deleted_at IS NULL"
# EXPECT: Index Scan on idx_cases_agent_active — no Seq Scan

git add .; git commit -m "feat: week-18 database optimization complete"
```

**Next:** `README-22-W19-Redis-Scaling.md`
