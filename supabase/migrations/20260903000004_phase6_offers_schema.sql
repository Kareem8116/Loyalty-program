-- ==============================================================================
-- Migration: Phase 6 — Offers Schema & RLS Policies (جدول العروض)
-- Description: Creates offers table for special and daily offers with date filtering
--              and multi-tenant security.
-- ==============================================================================

-- ==============================================================================
-- 6.1. offers Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('special', 'daily')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_offer_dates CHECK (end_date >= start_date)
);

-- Indexes for performant offer lookups
CREATE INDEX IF NOT EXISTS idx_offers_business_type 
    ON public.offers (business_id, type);

CREATE INDEX IF NOT EXISTS idx_offers_date_range 
    ON public.offers (business_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_offers_branch_id 
    ON public.offers (branch_id);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS tr_offers_updated_at ON public.offers;
CREATE TRIGGER tr_offers_updated_at
    BEFORE UPDATE ON public.offers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- RLS Policies for offers
-- Customers can read active offers for a business within valid date range.
-- Owners & Branch Admins manage offers for their business.
-- ==============================================================================
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- SELECT: Public read for active valid offers, full read for business admins
DROP POLICY IF EXISTS "offers_select_policy" ON public.offers;
CREATE POLICY "offers_select_policy" ON public.offers
    FOR SELECT TO anon, authenticated
    USING (
        is_super_admin()
        OR user_belongs_to_business(business_id)
        OR (
            is_active = true 
            AND CURRENT_DATE BETWEEN start_date AND end_date
        )
    );

-- INSERT: Super Admin, Owner, or Branch Admin (for their branch)
DROP POLICY IF EXISTS "offers_insert_policy" ON public.offers;
CREATE POLICY "offers_insert_policy" ON public.offers
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND (branch_id IS NULL OR branch_id = get_user_branch_for_business(business_id))
        )
    );

-- UPDATE: Super Admin, Owner, or Branch Admin
DROP POLICY IF EXISTS "offers_update_policy" ON public.offers;
CREATE POLICY "offers_update_policy" ON public.offers
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND (branch_id IS NULL OR branch_id = get_user_branch_for_business(business_id))
        )
    )
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND (branch_id IS NULL OR branch_id = get_user_branch_for_business(business_id))
        )
    );

-- DELETE: Super Admin, Owner, or Branch Admin
DROP POLICY IF EXISTS "offers_delete_policy" ON public.offers;
CREATE POLICY "offers_delete_policy" ON public.offers
    FOR DELETE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND (branch_id IS NULL OR branch_id = get_user_branch_for_business(business_id))
        )
    );
