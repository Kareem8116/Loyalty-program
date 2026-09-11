-- ==============================================================================
-- Migration: Pre-Phase 27 Prerequisites — Schema Completeness & Architecture Alignment
-- Description:
--   1. Add timezone to businesses (default 'Africa/Cairo')
--   2. Add per_transaction_points_limit to user_roles
--   3. Add remaining_amount to points_ledger with FIFO partial index
--   4. Create customer_auth_links table with PIN hash and rate-limiting columns
-- ==============================================================================

-- 1. Add timezone to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Cairo';

COMMENT ON COLUMN public.businesses.timezone IS
  'Local timezone of the business (default Africa/Cairo) to calculate daily limits and midnight resets.';

-- 2. Add per_transaction_points_limit to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS per_transaction_points_limit INTEGER;

COMMENT ON COLUMN public.user_roles.per_transaction_points_limit IS
  'Max points allowed per single transaction by this cashier. Null means unlimited.';

-- 3. Add remaining_amount to points_ledger and create partial FIFO index
ALTER TABLE public.points_ledger
  ADD COLUMN IF NOT EXISTS remaining_amount INTEGER;

-- Backfill existing earn rows where remaining_amount is null
UPDATE public.points_ledger
  SET remaining_amount = points_change
  WHERE points_change > 0 AND remaining_amount IS NULL;

COMMENT ON COLUMN public.points_ledger.remaining_amount IS
  'Remaining points from this specific earn transaction, consumed via FIFO upon redemptions.';

CREATE INDEX IF NOT EXISTS idx_points_ledger_fifo
  ON public.points_ledger(business_id, customer_id, created_at ASC)
  WHERE remaining_amount > 0;

-- 4. Create customer_auth_links table
CREATE TABLE IF NOT EXISTS public.customer_auth_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  access_pin_hash TEXT,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_auth_user_customer UNIQUE (auth_user_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_auth_links_auth_user ON public.customer_auth_links(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_auth_links_customer ON public.customer_auth_links(customer_id);

ALTER TABLE public.customer_auth_links ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists to make script re-runnable
DROP POLICY IF EXISTS "Users can manage their own customer auth links" ON public.customer_auth_links;
CREATE POLICY "Users can manage their own customer auth links"
  ON public.customer_auth_links
  FOR ALL
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);
