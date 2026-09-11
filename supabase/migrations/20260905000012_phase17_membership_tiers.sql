-- ==============================================================================
-- Phase 17: Membership Tiers (Loyalty Levels)
-- ==============================================================================

-- 1. Create membership_tiers table
CREATE TABLE IF NOT EXISTS public.membership_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_points_earned INTEGER NOT NULL DEFAULT 0,
  benefits_description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_business_tier_name UNIQUE (business_id, name)
);

-- 2. Indexes for fast lookup ordered by min_points_earned
CREATE INDEX IF NOT EXISTS idx_membership_tiers_biz_points 
ON public.membership_tiers (business_id, min_points_earned ASC);

-- ==============================================================================
-- Row-Level Security (RLS)
-- ==============================================================================

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;

-- Public read access so customers and cashiers can view tier levels and requirements
DROP POLICY IF EXISTS "Public can view membership tiers" ON public.membership_tiers;
CREATE POLICY "Public can view membership tiers"
ON public.membership_tiers FOR SELECT
TO public
USING (true);

-- Super Admin and Owner can create, update, and delete tiers
DROP POLICY IF EXISTS "Super admins and owners can manage membership tiers" ON public.membership_tiers;
CREATE POLICY "Super admins and owners can manage membership tiers"
ON public.membership_tiers FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = membership_tiers.business_id AND ur.role = 'owner')
      )
  )
);
