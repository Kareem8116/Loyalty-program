-- ==============================================================================
-- Phase 13: Customer Data Collection Consent
-- ==============================================================================

-- 1. Add consent_given_at timestamp column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ NULL;

-- 2. Index for audit queries
CREATE INDEX IF NOT EXISTS idx_customers_consent_given_at 
ON public.customers(consent_given_at);
