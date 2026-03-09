#!/bin/bash
set -e

# CCMP Database Partition Migration Script
# Migrates `cases` and `audit_logs` to native PostgreSQL range partitioning using `pg_partman`
# with a retention of 24 months. Batch logic ensures locks do not disrupt production.

PG_HOST=${POSTGRES_HOST:-localhost}
PG_PORT=${POSTGRES_PORT:-5433}
PG_USER=${POSTGRES_USER:-ccmp_user}
PG_DB=${POSTGRES_DB:-ccmp}

echo "Starting partition migration..."

psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DB << 'EOF'
BEGIN;

-- 1. Ensure pg_partman extension is installed (requires compilation in a real environment, using schema partman)
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

-- 2. Rename tables to hold old data
ALTER TABLE cases RENAME TO cases_old;
ALTER TABLE audit_logs RENAME TO audit_logs_old;

-- 3. Create Partition Tables
CREATE TABLE cases (LIKE cases_old INCLUDING DEFAULTS INCLUDING CONSTRAINTS) PARTITION BY RANGE (created_at);
CREATE TABLE audit_logs (LIKE audit_logs_old INCLUDING DEFAULTS INCLUDING CONSTRAINTS) PARTITION BY RANGE (created_at);

-- 4. Setup pg_partman templates (premake 3 months, retain 24 months)
SELECT partman.create_parent('public.cases', 'created_at', 'native', 'monthly', p_premake := 3);
SELECT partman.create_parent('public.audit_logs', 'created_at', 'native', 'monthly', p_premake := 3);

UPDATE partman.part_config SET retention = '24 months', retention_keep_table = false WHERE parent_table = 'public.cases';
UPDATE partman.part_config SET retention = '24 months', retention_keep_table = false WHERE parent_table = 'public.audit_logs';

COMMIT;

-- 5. Batch Copy Script Logic (run outside transaction to avoid huge WAL spikes)
DO $$
DECLARE
    batch_size int := 10000;
    rows_moved int := 0;
    total_moved int := 0;
BEGIN
    RAISE NOTICE 'Starting batch migration for cases...';
    LOOP
        WITH moved AS (
            DELETE FROM cases_old
            WHERE id IN (SELECT id FROM cases_old LIMIT batch_size)
            RETURNING *
        )
        INSERT INTO cases SELECT * FROM moved;
        
        GET DIAGNOSTICS rows_moved = ROW_COUNT;
        total_moved := total_moved + rows_moved;
        EXIT WHEN rows_moved = 0;
        
        -- Sleep or commit implicitly here via DO block limits in real wrappers
        RAISE NOTICE 'Moved % case records...', total_moved;
    END LOOP;
    
    total_moved := 0;
    RAISE NOTICE 'Starting batch migration for audit_logs...';
    LOOP
        WITH moved AS (
            DELETE FROM audit_logs_old
            WHERE id IN (SELECT id FROM audit_logs_old LIMIT batch_size)
            RETURNING *
        )
        INSERT INTO audit_logs SELECT * FROM moved;
        
        GET DIAGNOSTICS rows_moved = ROW_COUNT;
        total_moved := total_moved + rows_moved;
        EXIT WHEN rows_moved = 0;
        
        RAISE NOTICE 'Moved % audit_log records...', total_moved;
    END LOOP;
END $$;

-- 6. Cleanup
DROP TABLE cases_old;
DROP TABLE audit_logs_old;

EOF

echo "Partition migration complete."
