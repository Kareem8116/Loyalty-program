-- ==============================================================================
-- Migration: Phase 28 — Returns & Reversals of Points Transactions
-- Description:
--   1. Add reversal_of column (self-referencing FK) to points_ledger
--   2. Add consumption_breakdown JSONB column to record FIFO consumption breakdown
--   3. Create index for fast lookup of reversed transactions
-- ==============================================================================

-- 1. Add reversal_of column
ALTER TABLE public.points_ledger
  ADD COLUMN IF NOT EXISTS reversal_of UUID;

COMMENT ON COLUMN public.points_ledger.reversal_of IS
  'References the original points_ledger transaction that this refund or reversal entry reverses.';

-- 2. Add consumption_breakdown column
ALTER TABLE public.points_ledger
  ADD COLUMN IF NOT EXISTS consumption_breakdown JSONB;

COMMENT ON COLUMN public.points_ledger.consumption_breakdown IS
  'JSON array of { earn_id: UUID, amount: number } tracking exact FIFO consumption for redemptions.';

-- 3. Create index for fast lookups of reversals
CREATE INDEX IF NOT EXISTS idx_points_ledger_reversal_of
  ON public.points_ledger(reversal_of)
  WHERE reversal_of IS NOT NULL;
