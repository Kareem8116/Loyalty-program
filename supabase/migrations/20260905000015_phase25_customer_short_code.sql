-- Phase 25: Support 9-character alphanumeric customer codes
-- Alters qr_token from UUID to TEXT, preserving all existing UUID tokens while allowing 9-character codes.

ALTER TABLE public.customers 
  ALTER COLUMN qr_token TYPE TEXT;

ALTER TABLE public.customers 
  ALTER COLUMN qr_token DROP DEFAULT;