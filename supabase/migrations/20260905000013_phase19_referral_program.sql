-- ==============================================================================
-- Phase 19: Referral Program (نظام الإحالة)
-- ==============================================================================

-- 1. Add referral columns to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 2. Indexes for fast referral lookup
CREATE INDEX IF NOT EXISTS idx_customers_referral_code 
ON public.customers (referral_code);

CREATE INDEX IF NOT EXISTS idx_customers_referred_by 
ON public.customers (referred_by);

-- 3. Backfill referral_code for any existing customers who do not have one
UPDATE public.customers 
SET referral_code = 'REF-' || upper(substr(replace(id::text, '-', ''), 1, 6))
WHERE referral_code IS NULL;

-- 4. Create referral_settings table
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE UNIQUE,
  referrer_reward_points INTEGER NOT NULL DEFAULT 50 CHECK (referrer_reward_points >= 0),
  referee_reward_points INTEGER NOT NULL DEFAULT 25 CHECK (referee_reward_points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_settings_business 
ON public.referral_settings (business_id);

-- 5. Row Level Security (RLS) for referral_settings
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read referral settings" ON public.referral_settings;
CREATE POLICY "Public can read referral settings"
ON public.referral_settings FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Super admins and owners can manage referral settings" ON public.referral_settings;
CREATE POLICY "Super admins and owners can manage referral settings"
ON public.referral_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = referral_settings.business_id AND ur.role = 'owner')
      )
  )
);
