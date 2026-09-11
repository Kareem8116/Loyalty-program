-- ==============================================================================
-- Phase 16: Customer Notifications & Feature Control Foundation
-- ==============================================================================

-- 1. Feature Definitions Table (Phase 16.1 & 22.1)
CREATE TABLE IF NOT EXISTS public.feature_definitions (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed standard features from PLAN.md
INSERT INTO public.feature_definitions (key, name, description)
VALUES
  ('notifications', 'Customer Notifications', 'Automated customer notifications via WhatsApp Cloud API or SMS'),
  ('offers', 'Special Offers', 'Promotions and special deals for loyalty customers'),
  ('daily_offers', 'Daily Offers', 'Daily menu specials and rotating deals'),
  ('membership_tiers', 'Membership Tiers', 'Customer loyalty tiers based on lifetime points'),
  ('referral_program', 'Referral Program', 'Reward customers for referring friends'),
  ('points_expiry', 'Points Expiry', 'Automatic expiration of unused points after a configured duration'),
  ('customer_self_signup', 'Self Signup', 'Public registration portal for new customers'),
  ('analytics_reports', 'Analytics and Reports', 'Owner business analytics and insights dashboard'),
  ('branch_partnerships', 'Branch Partnerships', 'Cross-business point sharing and partnerships')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Business Features Table (Phase 16.1 & 22.2)
-- Note: Notifications default to false, other features default to true
CREATE TABLE IF NOT EXISTS public.business_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.feature_definitions(key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT unique_business_feature UNIQUE (business_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_business_features_biz_key 
ON public.business_features (business_id, feature_key);

-- 3. Business Notification Settings Table (Phase 16.2)
CREATE TABLE IF NOT EXISTS public.business_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'whatsapp',
  phone_number_id TEXT NULL,
  access_token TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_business_notification_settings UNIQUE (business_id)
);

CREATE INDEX IF NOT EXISTS idx_biz_notif_settings_biz 
ON public.business_notification_settings (business_id);

-- 4. Customer Notifications Preference (Phase 16.9 / RULES.md 3.1)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_notif_enabled
ON public.customers (business_id, notifications_enabled);

-- ==============================================================================
-- Row-Level Security (RLS)
-- ==============================================================================

-- Enable RLS on newly created tables
ALTER TABLE public.feature_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_notification_settings ENABLE ROW LEVEL SECURITY;

-- 5. Policies for feature_definitions (Public read for authenticated and anon)
DROP POLICY IF EXISTS "Public can view feature definitions" ON public.feature_definitions;
CREATE POLICY "Public can view feature definitions"
ON public.feature_definitions FOR SELECT
TO public
USING (true);

-- 6. Policies for business_features
DROP POLICY IF EXISTS "Users can view business features for their business" ON public.business_features;
CREATE POLICY "Users can view business features for their business"
ON public.business_features FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = business_features.business_id)
      )
  )
);

DROP POLICY IF EXISTS "Super admins and owners can manage business features" ON public.business_features;
CREATE POLICY "Super admins and owners can manage business features"
ON public.business_features FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = business_features.business_id AND ur.role = 'owner')
      )
  )
);

-- 7. Policies for business_notification_settings (Credentials restricted to Super Admin and Business Owner)
DROP POLICY IF EXISTS "Super admins and owners can view notification settings" ON public.business_notification_settings;
CREATE POLICY "Super admins and owners can view notification settings"
ON public.business_notification_settings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = business_notification_settings.business_id AND ur.role = 'owner')
      )
  )
);

DROP POLICY IF EXISTS "Super admins and owners can modify notification settings" ON public.business_notification_settings;
CREATE POLICY "Super admins and owners can modify notification settings"
ON public.business_notification_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = business_notification_settings.business_id AND ur.role = 'owner')
      )
  )
);
