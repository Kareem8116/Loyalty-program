-- ==============================================================================
-- Migration: Phase 0-1 Gaps — Add timezone to businesses + autovacuum on points_ledger
-- 
-- Fixes two mandatory items from PLAN.md that were missing:
--   1. PLAN.md 1.1: timezone column on businesses (إلزامي لضبط الحدود اليومية بتوقيت المكان)
--   2. PLAN.md 1.5.1: autovacuum tuning on points_ledger (FIFO MVCC Dead Tuple mitigation)
-- ==============================================================================

-- ==============================================================================
-- Fix 1.1: Add timezone column to businesses
-- Required for correct daily limits calculation per business local time (Phase 15)
-- ==============================================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Cairo';

COMMENT ON COLUMN public.businesses.timezone IS
  'IANA timezone identifier for this business (e.g. Africa/Cairo). '
  'Used to calculate daily cashier limits and expiry windows in local time. '
  'Mandatory per PLAN.md 1.1 — defaults to Africa/Cairo for Egyptian businesses.';

-- ==============================================================================
-- Fix 1.5.1: Tune autovacuum on points_ledger (and ALL its leaf partitions)
-- 
-- points_ledger is a partitioned table — Postgres 14+ requires setting storage
-- parameters on the LEAF PARTITIONS, not the parent (ERROR 42809 otherwise).
-- This DO block discovers all existing partitions dynamically and applies the
-- same autovacuum settings to each one.
--
-- FIFO (Phase 14) repeatedly UPDATEs remaining_amount on existing rows, creating
-- Dead Tuples via MVCC. These settings trigger vacuum after 1% change vs 20% default.
-- ==============================================================================
DO $$
DECLARE
  partition_name TEXT;
  counter        INT := 0;
BEGIN
  -- Iterate over every leaf/child partition of points_ledger
  FOR partition_name IN
    SELECT c.relname
    FROM   pg_class    c
    JOIN   pg_inherits i ON c.oid = i.inhrelid
    JOIN   pg_class    p ON p.oid = i.inhparent
    WHERE  p.relname = 'points_ledger'
      AND  c.relkind IN ('r', 'p')   -- regular table or sub-partition
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I SET (
         autovacuum_vacuum_scale_factor   = 0.01,
         autovacuum_analyze_scale_factor  = 0.005,
         autovacuum_vacuum_cost_delay     = 2
       )', partition_name
    );
    counter := counter + 1;
  END LOOP;

  -- If no partitions exist yet (non-partitioned table), apply directly
  IF counter = 0 THEN
    ALTER TABLE public.points_ledger SET (
      autovacuum_vacuum_scale_factor   = 0.01,
      autovacuum_analyze_scale_factor  = 0.005,
      autovacuum_vacuum_cost_delay     = 2
    );
    RAISE NOTICE 'points_ledger is not yet partitioned — applied autovacuum directly.';
  ELSE
    RAISE NOTICE 'Applied autovacuum settings to % partitions of points_ledger.', counter;
  END IF;
END;
$$;

