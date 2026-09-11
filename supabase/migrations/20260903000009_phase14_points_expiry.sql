-- ==============================================================================
-- Phase 14: Points Expiry & Automated Deduction
-- ==============================================================================

-- 1. Add points_expiry_months to redemption_rates
ALTER TABLE public.redemption_rates 
ADD COLUMN IF NOT EXISTS points_expiry_months INTEGER DEFAULT 12 CHECK (points_expiry_months >= 0);

-- 2. Add expires_at to points_ledger (partitioned parent table propagates to all partitions)
ALTER TABLE public.points_ledger 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- 3. Index on expires_at for efficient cron job queries
CREATE INDEX IF NOT EXISTS idx_points_ledger_expires_at 
ON public.points_ledger (expires_at) 
WHERE expires_at IS NOT NULL;
