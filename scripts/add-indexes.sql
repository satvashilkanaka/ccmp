-- Week 18 Database Optimization — Partial Concurrent Indexes
-- These must be run outside of a transaction block.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_agent_active 
ON cases(assigned_to_id) 
WHERE deleted_at IS NULL AND status NOT IN ('RESOLVED','CLOSED');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_sla_active 
ON cases(sla_due_at) 
WHERE status NOT IN ('RESOLVED','CLOSED');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_metadata_gin 
ON cases USING GIN(metadata);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_actor_ts 
ON audit_logs(actor_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_events_type_ts 
ON case_events(case_id, event_type, created_at DESC);
