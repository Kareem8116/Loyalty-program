-- ==============================================================================
-- Migration: Phase 4 Fix — Add redemption_type to redemption_rates
-- Description: PLAN.md 1.6 & 4.4 & RULES.md Section 1 require each business
--              to independently set their redemption method: product, cash, or both.
--              This was missing from the initial schema.
-- ==============================================================================

ALTER TABLE public.redemption_rates
  ADD COLUMN IF NOT EXISTS redemption_type TEXT NOT NULL DEFAULT 'both'
  CHECK (redemption_type IN ('product', 'cash', 'both'));

COMMENT ON COLUMN public.redemption_rates.redemption_type IS
  'Controls which redemption methods the cashier can use: product (menu item only), cash (monetary discount only), or both (cashier chooses at time of transaction).';
