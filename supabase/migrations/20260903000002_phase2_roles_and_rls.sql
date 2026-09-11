-- ==============================================================================
-- Migration: Phase 2 — Roles & Row Level Security (Auth + RLS)
-- Description: Creates user_roles table, helper security functions, and RLS policies.
-- Adheres strictly to RULES.md (Sections 1 & 2) and PLAN.md (Phase 2).
-- ==============================================================================

-- ==============================================================================
-- 2.2. user_roles Table (جدول أدوار المستخدمين)
-- Roles hierarchy: super_admin > owner > branch_admin > cashier
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'owner', 'branch_admin', 'cashier')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_business_role UNIQUE (user_id, role, business_id)
);

-- Index for fast role & business lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_business_id ON public.user_roles(business_id);

DROP TRIGGER IF EXISTS tr_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER tr_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- Helper Security Functions (STABLE, SECURITY DEFINER)
-- Used inside RLS policies for performant row isolation
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
  SELECT branch_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 2.3. RLS Policies: businesses
-- Super Admin sees all, Owner sees their business only
-- ==============================================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_select_policy" ON public.businesses;
CREATE POLICY "businesses_select_policy" ON public.businesses
    FOR SELECT TO authenticated
    USING (
        is_super_admin() OR id = get_user_business_id()
    );

DROP POLICY IF EXISTS "businesses_insert_policy" ON public.businesses;
CREATE POLICY "businesses_insert_policy" ON public.businesses
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
    );

DROP POLICY IF EXISTS "businesses_update_policy" ON public.businesses;
CREATE POLICY "businesses_update_policy" ON public.businesses
    FOR UPDATE TO authenticated
    USING (
        is_super_admin() OR (id = get_user_business_id() AND get_user_role() = 'owner')
    )
    WITH CHECK (
        is_super_admin() OR (id = get_user_business_id() AND get_user_role() = 'owner')
    );

DROP POLICY IF EXISTS "businesses_delete_policy" ON public.businesses;
CREATE POLICY "businesses_delete_policy" ON public.businesses
    FOR DELETE TO authenticated
    USING (
        is_super_admin()
    );

-- ==============================================================================
-- 2.4. RLS Policies: customers
-- Completely isolated by business_id
-- ==============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
CREATE POLICY "customers_select_policy" ON public.customers
    FOR SELECT TO authenticated
    USING (
        is_super_admin() OR business_id = get_user_business_id()
    );

DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
CREATE POLICY "customers_insert_policy" ON public.customers
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() IN ('owner', 'branch_admin', 'cashier'))
    );

DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
CREATE POLICY "customers_update_policy" ON public.customers
    FOR UPDATE TO authenticated
    USING (
        is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() IN ('owner', 'branch_admin'))
    )
    WITH CHECK (
        is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() IN ('owner', 'branch_admin'))
    );

DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;
CREATE POLICY "customers_delete_policy" ON public.customers
    FOR DELETE TO authenticated
    USING (
        is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner')
    );

-- ==============================================================================
-- 2.5. RLS Policies: points_ledger
-- Isolated by business_id. Cashier can INSERT only, CANNOT update or delete.
-- Immutable ledger: Updates and Deletions are forbidden for all regular roles.
-- ==============================================================================
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "points_ledger_select_policy" ON public.points_ledger;
CREATE POLICY "points_ledger_select_policy" ON public.points_ledger
    FOR SELECT TO authenticated
    USING (
        is_super_admin() OR business_id = get_user_business_id()
    );

DROP POLICY IF EXISTS "points_ledger_insert_policy" ON public.points_ledger;
CREATE POLICY "points_ledger_insert_policy" ON public.points_ledger
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() IN ('owner', 'branch_admin', 'cashier'))
    );

-- No UPDATE policy for non-super_admin (Immutable ledger rule)
DROP POLICY IF EXISTS "points_ledger_update_policy" ON public.points_ledger;
CREATE POLICY "points_ledger_update_policy" ON public.points_ledger
    FOR UPDATE TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- No DELETE policy for non-super_admin (Immutable ledger rule)
DROP POLICY IF EXISTS "points_ledger_delete_policy" ON public.points_ledger;
CREATE POLICY "points_ledger_delete_policy" ON public.points_ledger
    FOR DELETE TO authenticated
    USING (is_super_admin());

-- ==============================================================================
-- Supporting RLS Policies for other core tables:
-- branches, menu_items, redemption_rates, user_roles
-- ==============================================================================
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT TO authenticated
    USING (is_super_admin() OR business_id = get_user_business_id());

DROP POLICY IF EXISTS "branches_write_policy" ON public.branches;
CREATE POLICY "branches_write_policy" ON public.branches
    FOR ALL TO authenticated
    USING (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'))
    WITH CHECK (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'));

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_select_policy" ON public.menu_items;
CREATE POLICY "menu_items_select_policy" ON public.menu_items
    FOR SELECT TO authenticated
    USING (is_super_admin() OR business_id = get_user_business_id());

DROP POLICY IF EXISTS "menu_items_write_policy" ON public.menu_items;
CREATE POLICY "menu_items_write_policy" ON public.menu_items
    FOR ALL TO authenticated
    USING (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() IN ('owner', 'branch_admin')))
    WITH CHECK (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() IN ('owner', 'branch_admin')));

ALTER TABLE public.redemption_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redemption_rates_select_policy" ON public.redemption_rates;
CREATE POLICY "redemption_rates_select_policy" ON public.redemption_rates
    FOR SELECT TO authenticated
    USING (is_super_admin() OR business_id = get_user_business_id());

DROP POLICY IF EXISTS "redemption_rates_write_policy" ON public.redemption_rates;
CREATE POLICY "redemption_rates_write_policy" ON public.redemption_rates
    FOR ALL TO authenticated
    USING (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'))
    WITH CHECK (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
CREATE POLICY "user_roles_select_policy" ON public.user_roles
    FOR SELECT TO authenticated
    USING (is_super_admin() OR user_id = auth.uid() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'));

DROP POLICY IF EXISTS "user_roles_write_policy" ON public.user_roles;
CREATE POLICY "user_roles_write_policy" ON public.user_roles
    FOR ALL TO authenticated
    USING (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'))
    WITH CHECK (is_super_admin() OR (business_id = get_user_business_id() AND get_user_role() = 'owner'));
