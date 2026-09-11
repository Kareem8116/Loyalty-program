-- Phase 24 Migration: AI Recommendations via Gemini API

-- 1. Insert 'ai_recommendations' feature definition
INSERT INTO public.feature_definitions (key, name, description)
VALUES (
  'ai_recommendations', 
  'توصيات ذكية بـ Gemini', 
  'توليد رسالة تشجيعية وتوصية مكافأة ذكية للعميل عبر الذكاء الاصطناعي بناء على رصيده ومكافآته المتاحة'
)
ON CONFLICT (key) DO UPDATE
SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Create business_ai_settings table
CREATE TABLE IF NOT EXISTS public.business_ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  gemini_api_key TEXT NOT NULL,
  model TEXT DEFAULT 'gemini-1.5-flash',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_business_ai_settings_business_id UNIQUE (business_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_business_ai_settings_business_id 
ON public.business_ai_settings(business_id);

-- 4. Enable RLS
ALTER TABLE public.business_ai_settings ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Super Admin can do everything
DROP POLICY IF EXISTS "Super Admin can manage all business AI settings" ON public.business_ai_settings;
CREATE POLICY "Super Admin can manage all business AI settings"
ON public.business_ai_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  )
);

-- Business Owner can view and edit their own business settings
DROP POLICY IF EXISTS "Business Owner can manage their business AI settings" ON public.business_ai_settings;
CREATE POLICY "Business Owner can manage their business AI settings"
ON public.business_ai_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.business_id = business_ai_settings.business_id
      AND ur.role = 'owner'
  )
);
