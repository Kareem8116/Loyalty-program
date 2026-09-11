-- ==============================================================================
-- Migration: Phase 6.1.1 — Add image_url to offers table
-- ==============================================================================
ALTER TABLE public.offers 
ADD COLUMN IF NOT EXISTS image_url TEXT;
