-- ==============================================================================
-- Migration: Phase 15 Advanced — Fraud Protection & Owner Daily Review
-- ==============================================================================

-- 1. Add invoice_reference, flagged_by_owner, and flag_reason to points_ledger
ALTER TABLE public.points_ledger
  ADD COLUMN IF NOT EXISTS invoice_reference TEXT,
  ADD COLUMN IF NOT EXISTS flagged_by_owner BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flag_reason TEXT;

COMMENT ON COLUMN public.points_ledger.invoice_reference IS
  'Optional/Mandatory invoice number from the POS system to prevent double-adding points.';

COMMENT ON COLUMN public.points_ledger.flagged_by_owner IS
  'Set to true by business owner/admin during daily review for flagged/suspicious transactions.';

COMMENT ON COLUMN public.points_ledger.flag_reason IS
  'Documentary reason provided by owner/admin when flagging a transaction for review.';

-- 2. Partial unique index to enforce invoice uniqueness per business
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_ledger_invoice
  ON public.points_ledger(business_id, invoice_reference)
  WHERE invoice_reference IS NOT NULL;

-- 3. Indexes for fast daily review filtering
CREATE INDEX IF NOT EXISTS idx_points_ledger_daily_review
  ON public.points_ledger(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_points_ledger_flagged
  ON public.points_ledger(business_id, flagged_by_owner, created_at DESC)
  WHERE flagged_by_owner = true;

-- 4. Add high_value_redemption_threshold to redemption_rates
ALTER TABLE public.redemption_rates
  ADD COLUMN IF NOT EXISTS high_value_redemption_threshold INTEGER;

COMMENT ON COLUMN public.redemption_rates.high_value_redemption_threshold IS
  'Optional points threshold above which redemption requires customer 4-digit PIN confirmation.';

-- 5. Add per_minute_points_limit and manager_pin_hash to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS per_minute_points_limit INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS manager_pin_hash TEXT;

COMMENT ON COLUMN public.user_roles.per_minute_points_limit IS
  'Max add points operations allowed per minute per cashier. Default is 5.';

-- 6. Add pin_hash to customers for high-value redemption verification
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

COMMENT ON COLUMN public.customers.pin_hash IS
  'Hashed 4-digit PIN chosen by customer for authenticating high-value redemptions.';
