-- ==============================================================================
-- Migration: 20261020000041 — Fix Missing Columns
-- Adds columns that exist in migration files but were never applied to production DB
-- ==============================================================================

-- 1. branches.is_active (referenced in code but missing from DB)
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_branches_is_active
  ON public.branches (business_id, is_active);

-- 2. redemption_rates.max_offline_transactions (Phase 32 column)
ALTER TABLE public.redemption_rates
  ADD COLUMN IF NOT EXISTS max_offline_transactions INT NOT NULL DEFAULT 25;
