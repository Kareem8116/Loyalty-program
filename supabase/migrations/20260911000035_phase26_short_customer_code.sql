-- ==============================================================================
-- Phase 26: Short Customer Code
-- Adds a `short_code` column (9-char, unique) to the customers table.
-- The actual code is generated in the application layer using Sqids
-- (deterministic, collision-free encoding of the customer's sequential row ID).
-- The DB column stores the code for fast reverse-lookup by cashiers.
-- ==============================================================================

-- 1. Add short_code column to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- 2. Unique index for fast cashier lookup and global uniqueness enforcement
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_short_code
  ON public.customers (short_code)
  WHERE short_code IS NOT NULL;

-- 3. Index for fast text-search lookup (cashier types partial code)
CREATE INDEX IF NOT EXISTS idx_customers_short_code_trgm
  ON public.customers (short_code);

-- NOTE: The short_code is populated when a customer is created
-- via the application layer (lib/shortcode.ts using Sqids).
-- Existing customers without a short_code will be backfilled via a
-- one-time admin script or a Supabase Edge Function trigger.
