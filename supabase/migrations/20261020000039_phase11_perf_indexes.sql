-- ==============================================================================
-- Phase 11: Additional Performance Indexes & Queue Support
-- ==============================================================================
-- This migration adds indexes specifically needed for:
-- 11.2 — Redis cache invalidation patterns (business-level reads)
-- 11.3 — Async queue worker: idempotency key lookup optimization
-- 11.5 — Load test preparation: ensure critical query paths are indexed
-- ==============================================================================

-- ─── 11.2: Fast menu item lookups (by business, optional branch) ─────────────
-- These cover the getCachedMenuItems() fetcher when cache misses occur.
CREATE INDEX IF NOT EXISTS idx_menu_items_business_branch
  ON public.menu_items (business_id, branch_id NULLS FIRST, name);

-- ─── 11.2: Fast redemption rates lookup (primary lookup pattern) ─────────────
CREATE INDEX IF NOT EXISTS idx_redemption_rates_business
  ON public.redemption_rates (business_id);

-- ─── 11.2: Fast branding lookup ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_branding_business
  ON public.business_branding (business_id);

-- ─── 11.3: Idempotency key index for queue deduplication ────────────────────
-- The atomic stored procedure checks idempotency_key on each job processed.
-- This index makes that check O(log N) instead of O(N).
CREATE INDEX IF NOT EXISTS idx_points_ledger_idempotency
  ON public.points_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── 11.4: Confirm autovacuum settings are applied to partitions ─────────────
-- (These settings must be applied to each child partition separately,
--  as ALTER TABLE on the parent does not cascade to children.)
-- Applied here to the default partition; business-specific partitions
-- inherit from the create_business_partition() trigger function below.

-- Re-apply autovacuum settings to default partition
ALTER TABLE IF EXISTS public.points_ledger_default
  SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005,
    autovacuum_vacuum_cost_delay = 2
  );

-- ─── 11.4: Update trigger to also set autovacuum on new partitions ────────────
-- Extends the existing trigger to configure autovacuum on each new partition.
CREATE OR REPLACE FUNCTION public.create_business_partition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partition_name TEXT;
BEGIN
  partition_name := 'points_ledger_' || replace(NEW.id::text, '-', '_');

  -- Create the partition
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.points_ledger FOR VALUES IN (%L)',
    partition_name,
    NEW.id
  );

  -- Apply autovacuum settings to the new partition
  EXECUTE format(
    'ALTER TABLE public.%I SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005, autovacuum_vacuum_cost_delay = 2)',
    partition_name
  );

  RETURN NEW;
END;
$$;

-- ─── 11.5: Covering index for cashier daily stats query (Phase 15.3) ──────────
-- Speeds up: SELECT SUM(points_change) WHERE business_id=X AND created_by=Y AND created_at >= today
CREATE INDEX IF NOT EXISTS idx_points_ledger_cashier_daily
  ON public.points_ledger (business_id, created_by, created_at DESC)
  WHERE points_change > 0;

-- ─── 11.5: Covering index for customer balance calculation ────────────────────
-- Speeds up: SELECT SUM(points_change) WHERE business_id=X AND customer_id=Y
CREATE INDEX IF NOT EXISTS idx_points_ledger_customer_balance
  ON public.points_ledger (business_id, customer_id, created_at DESC);

-- ─── 11.5: Partial index for FIFO expiry check (already in Phase 14, confirm) ─
CREATE INDEX IF NOT EXISTS idx_points_ledger_fifo
  ON public.points_ledger (business_id, customer_id, created_at ASC)
  WHERE remaining_amount > 0;

-- ─── Comment for observability ────────────────────────────────────────────────
COMMENT ON INDEX idx_points_ledger_cashier_daily IS 'Phase 11.5: Covers cashier daily stats aggregation query';
COMMENT ON INDEX idx_points_ledger_customer_balance IS 'Phase 11.5: Covers customer balance aggregation query';
COMMENT ON INDEX idx_points_ledger_fifo IS 'Phase 14.3.1: FIFO consumption partial index (remaining_amount > 0 only)';
COMMENT ON INDEX idx_points_ledger_idempotency IS 'Phase 11.3: Queue deduplication idempotency key lookup';
