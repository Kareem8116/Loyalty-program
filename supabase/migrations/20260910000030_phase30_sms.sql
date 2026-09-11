-- ==============================================================================
-- Migration: Phase 30 - SMS Notifications (business_sms_settings & customer preference)
-- ==============================================================================

-- 1. Register sms_notifications feature definition
INSERT INTO public.feature_definitions (key, name, description)
VALUES (
  'sms_notifications',
  'SMS Notifications',
  'Automated customer SMS notifications via Twilio or custom provider'
)
ON CONFLICT (key) DO NOTHING;

-- 2. Create business_sms_settings table (Phase 30.2)
CREATE TABLE IF NOT EXISTS public.business_sms_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mock', -- 'mock' | 'twilio'
  account_sid TEXT NULL,
  auth_token TEXT NULL,
  sender_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_business_sms_settings UNIQUE (business_id)
);

CREATE INDEX IF NOT EXISTS idx_biz_sms_settings_biz 
ON public.business_sms_settings (business_id);

-- 3. Customer Notification Channel Preference (Phase 30.7)
-- Channels: 'all' | 'whatsapp' | 'sms' | 'none'
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS notification_channel TEXT NOT NULL DEFAULT 'all';

CREATE INDEX IF NOT EXISTS idx_customers_notif_channel
ON public.customers (business_id, notification_channel);

-- ==============================================================================
-- Row-Level Security (RLS)
-- ==============================================================================

ALTER TABLE public.business_sms_settings ENABLE ROW LEVEL SECURITY;

-- Super admins and owners can view SMS settings
DROP POLICY IF EXISTS "Super admins and owners can view SMS settings" ON public.business_sms_settings;
CREATE POLICY "Super admins and owners can view SMS settings"
ON public.business_sms_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = business_sms_settings.business_id AND ur.role = 'owner')
      )
  )
);

-- Super admins and owners can modify SMS settings
DROP POLICY IF EXISTS "Super admins and owners can modify SMS settings" ON public.business_sms_settings;
CREATE POLICY "Super admins and owners can modify SMS settings"
ON public.business_sms_settings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'super_admin'
        OR (ur.business_id = business_sms_settings.business_id AND ur.role = 'owner')
      )
  )
);
