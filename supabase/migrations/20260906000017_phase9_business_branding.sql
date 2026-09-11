-- Phase 9: Business Branding, Layout Variants & Customization
-- Migration: 20260906000017_phase9_business_branding.sql

CREATE TABLE IF NOT EXISTS public.business_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    display_name TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#FAF7F2',
    accent_color TEXT DEFAULT '#B08968',
    font_family TEXT DEFAULT 'Inter',
    layout_variant TEXT DEFAULT 'centered-classic' CHECK (layout_variant IN ('centered-classic', 'qr-top', 'horizontal-offers')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT business_branding_business_id_key UNIQUE (business_id)
);

-- Index for fast lookup by business_id
CREATE INDEX IF NOT EXISTS idx_business_branding_business_id ON public.business_branding(business_id);

-- Enable RLS
ALTER TABLE public.business_branding ENABLE ROW LEVEL SECURITY;

-- 1. Public read policy: Anyone (including customers/anon) can read branding to render customer screens
CREATE POLICY "Public read for business branding"
    ON public.business_branding
    FOR SELECT
    USING (true);

-- 2. Super admin full control
CREATE POLICY "Super admin full control on business branding"
    ON public.business_branding
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
        )
    );

-- 3. Business owner update policy
CREATE POLICY "Owner update business branding"
    ON public.business_branding
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'owner'
              AND ur.business_id = business_branding.business_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'owner'
              AND ur.business_id = business_branding.business_id
        )
    );

-- 4. Business owner insert policy
CREATE POLICY "Owner insert business branding"
    ON public.business_branding
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'owner'
              AND ur.business_id = business_branding.business_id
        )
    );

-- Seed initial branding rows for all existing businesses
INSERT INTO public.business_branding (business_id, display_name, primary_color, accent_color, font_family, layout_variant)
SELECT 
    b.id, 
    b.name, 
    '#FAF7F2', 
    '#B08968', 
    'Inter', 
    'centered-classic'
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;
