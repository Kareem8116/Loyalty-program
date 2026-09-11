-- ==============================================================================
-- Migration: Phase 10 — Partnerships & Cross-Business Points Sharing
-- Description: Creates partnerships and partnership_transfers tables,
--              RLS policies, constraints, triggers, and indexes.
-- Adheres to RULES.md & PLAN.md Phase 10
-- ==============================================================================

-- ==============================================================================
-- 10.1. partnerships Table (جدول الشراكات بين الأماكن)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.partnerships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id_a UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    business_id_b UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
    terms TEXT,
    initiated_by UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ensure business_id_a < business_id_b to prevent duplicate pairs
    CONSTRAINT chk_ordered_business_ids CHECK (business_id_a < business_id_b),
    -- Unique pair of businesses
    CONSTRAINT uq_partnership_pair UNIQUE (business_id_a, business_id_b),
    -- Cannot partner with self
    CONSTRAINT chk_no_self_partnership CHECK (business_id_a <> business_id_b)
);

DROP TRIGGER IF EXISTS tr_partnerships_updated_at ON public.partnerships;
CREATE TRIGGER tr_partnerships_updated_at
    BEFORE UPDATE ON public.partnerships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for fast lookups by each business side
CREATE INDEX IF NOT EXISTS idx_partnerships_business_a ON public.partnerships(business_id_a);
CREATE INDEX IF NOT EXISTS idx_partnerships_business_b ON public.partnerships(business_id_b);
CREATE INDEX IF NOT EXISTS idx_partnerships_status ON public.partnerships(status);

-- ==============================================================================
-- 10.4. partnership_transfers Table (جدول تحويلات النقط بين الشراكات)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.partnership_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partnership_id UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
    from_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    to_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    points_transferred INTEGER NOT NULL CHECK (points_transferred > 0),
    reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for partnership_transfers
CREATE INDEX IF NOT EXISTS idx_ptransfers_partnership ON public.partnership_transfers(partnership_id);
CREATE INDEX IF NOT EXISTS idx_ptransfers_customer ON public.partnership_transfers(customer_id);
CREATE INDEX IF NOT EXISTS idx_ptransfers_from_biz ON public.partnership_transfers(from_business_id);
CREATE INDEX IF NOT EXISTS idx_ptransfers_to_biz ON public.partnership_transfers(to_business_id);

-- ==============================================================================
-- RLS Policies for partnerships
-- ==============================================================================
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY partnerships_super_admin_all ON public.partnerships
    FOR ALL
    USING (public.get_user_role() = 'super_admin')
    WITH CHECK (public.get_user_role() = 'super_admin');

-- Owner: can see partnerships where their business is either side
CREATE POLICY partnerships_owner_select ON public.partnerships
    FOR SELECT
    USING (
        public.get_user_role() IN ('owner', 'branch_admin')
        AND (
            business_id_a = public.get_user_business_id()
            OR business_id_b = public.get_user_business_id()
        )
    );

-- Owner: can insert partnerships where their business is either side (initiator)
CREATE POLICY partnerships_owner_insert ON public.partnerships
    FOR INSERT
    WITH CHECK (
        public.get_user_role() = 'owner'
        AND (
            business_id_a = public.get_user_business_id()
            OR business_id_b = public.get_user_business_id()
        )
    );

-- Owner: can update partnerships where their business is either side (accept/reject)
CREATE POLICY partnerships_owner_update ON public.partnerships
    FOR UPDATE
    USING (
        public.get_user_role() = 'owner'
        AND (
            business_id_a = public.get_user_business_id()
            OR business_id_b = public.get_user_business_id()
        )
    )
    WITH CHECK (
        public.get_user_role() = 'owner'
        AND (
            business_id_a = public.get_user_business_id()
            OR business_id_b = public.get_user_business_id()
        )
    );

-- ==============================================================================
-- RLS Policies for partnership_transfers
-- ==============================================================================
ALTER TABLE public.partnership_transfers ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY ptransfers_super_admin_all ON public.partnership_transfers
    FOR ALL
    USING (public.get_user_role() = 'super_admin')
    WITH CHECK (public.get_user_role() = 'super_admin');

-- Owner: can see transfers involving their business
CREATE POLICY ptransfers_owner_select ON public.partnership_transfers
    FOR SELECT
    USING (
        public.get_user_role() IN ('owner', 'branch_admin')
        AND (
            from_business_id = public.get_user_business_id()
            OR to_business_id = public.get_user_business_id()
        )
    );

-- Owner: can insert transfers from their business
CREATE POLICY ptransfers_owner_insert ON public.partnership_transfers
    FOR INSERT
    WITH CHECK (
        public.get_user_role() = 'owner'
        AND from_business_id = public.get_user_business_id()
    );
