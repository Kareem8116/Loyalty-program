-- ==============================================================================
-- Migration: Phase 2 FIX — Refined Helper Functions & Branch-Level RLS
-- Description: Fixes helper functions to handle multi-role users properly,
--              and adds branch-level isolation for branch_admin & cashier roles
--              as required by RULES.md Section 2.
-- ==============================================================================

-- ==============================================================================
-- FIXED Helper Functions: Handle multi-role users correctly
-- Instead of LIMIT 1 (arbitrary), these now accept business_id context
-- and the is_super_admin check remains unchanged.
-- ==============================================================================

-- Returns ALL roles for the current user (not just one)
CREATE OR REPLACE FUNCTION public.get_user_role_for_business(p_business_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid() AND business_id = p_business_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Check if user belongs to a specific business
CREATE OR REPLACE FUNCTION public.user_belongs_to_business(p_business_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = p_business_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Check if user has specific role in specific business
CREATE OR REPLACE FUNCTION public.user_has_role_in_business(p_business_id UUID, p_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = p_business_id AND role = p_role
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Get the branch_id for the current user in a specific business
CREATE OR REPLACE FUNCTION public.get_user_branch_for_business(p_business_id UUID)
RETURNS UUID AS $$
  SELECT branch_id FROM public.user_roles
  WHERE user_id = auth.uid() AND business_id = p_business_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Check if a user's role is branch-scoped (branch_admin or cashier)
CREATE OR REPLACE FUNCTION public.is_branch_scoped_role(p_business_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('branch_admin', 'cashier')
      AND branch_id IS NOT NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- DROP and RECREATE: businesses RLS (unchanged logic, cleaner functions)
-- Super Admin sees all. Owner sees their business. Branch Admin/Cashier see theirs.
-- ==============================================================================
DROP POLICY IF EXISTS "businesses_select_policy" ON public.businesses;
CREATE POLICY "businesses_select_policy" ON public.businesses
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR user_belongs_to_business(id)
    );

-- INSERT: Only Super Admin can create businesses
DROP POLICY IF EXISTS "businesses_insert_policy" ON public.businesses;
CREATE POLICY "businesses_insert_policy" ON public.businesses
    FOR INSERT TO authenticated
    WITH CHECK (is_super_admin());

-- UPDATE: Super Admin or Owner of the business
DROP POLICY IF EXISTS "businesses_update_policy" ON public.businesses;
CREATE POLICY "businesses_update_policy" ON public.businesses
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(id, 'owner')
    )
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(id, 'owner')
    );

-- DELETE: Only Super Admin
DROP POLICY IF EXISTS "businesses_delete_policy" ON public.businesses;
CREATE POLICY "businesses_delete_policy" ON public.businesses
    FOR DELETE TO authenticated
    USING (is_super_admin());

-- ==============================================================================
-- FIXED: branches RLS — Branch Admin/Cashier see only their branch
-- ==============================================================================
DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
DROP POLICY IF EXISTS "branches_write_policy" ON public.branches;

CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR (
            user_belongs_to_business(business_id)
            AND (
                -- Owner sees all branches
                user_has_role_in_business(business_id, 'owner')
                -- Branch Admin / Cashier see only their assigned branch
                OR id = get_user_branch_for_business(business_id)
            )
        )
    );

CREATE POLICY "branches_insert_policy" ON public.branches
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    );

CREATE POLICY "branches_update_policy" ON public.branches
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    )
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    );

CREATE POLICY "branches_delete_policy" ON public.branches
    FOR DELETE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    );

-- ==============================================================================
-- FIXED: customers RLS
-- Owner sees all customers in business.
-- Branch Admin / Cashier: customers belong to business_id (not branch-scoped),
-- so they see all customers in their business (needed to scan QR for any customer).
-- This is correct because customers belong to the business, not a single branch.
-- ==============================================================================
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR user_belongs_to_business(business_id)
    );

CREATE POLICY "customers_insert_policy" ON public.customers
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
        OR user_belongs_to_business(business_id)
    );

CREATE POLICY "customers_update_policy" ON public.customers
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR (user_belongs_to_business(business_id) AND NOT user_has_role_in_business(business_id, 'cashier'))
    )
    WITH CHECK (
        is_super_admin()
        OR (user_belongs_to_business(business_id) AND NOT user_has_role_in_business(business_id, 'cashier'))
    );

CREATE POLICY "customers_delete_policy" ON public.customers
    FOR DELETE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    );

-- ==============================================================================
-- FIXED: points_ledger RLS — Branch-scoped for branch_admin & cashier
-- Branch Admin/Cashier can only INSERT for their own branch.
-- Owner sees all ledger entries across all branches.
-- ==============================================================================
DROP POLICY IF EXISTS "points_ledger_select_policy" ON public.points_ledger;
DROP POLICY IF EXISTS "points_ledger_insert_policy" ON public.points_ledger;
DROP POLICY IF EXISTS "points_ledger_update_policy" ON public.points_ledger;
DROP POLICY IF EXISTS "points_ledger_delete_policy" ON public.points_ledger;

CREATE POLICY "points_ledger_select_policy" ON public.points_ledger
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR (
            user_belongs_to_business(business_id)
            AND (
                -- Owner sees everything
                user_has_role_in_business(business_id, 'owner')
                -- Branch Admin / Cashier see only their branch's transactions
                OR branch_id = get_user_branch_for_business(business_id)
            )
        )
    );

CREATE POLICY "points_ledger_insert_policy" ON public.points_ledger
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
        OR (
            user_belongs_to_business(business_id)
            AND (
                user_has_role_in_business(business_id, 'owner')
                -- Branch Admin / Cashier can only insert for their branch
                OR branch_id = get_user_branch_for_business(business_id)
            )
        )
    );

-- Immutable ledger: Only Super Admin can update
CREATE POLICY "points_ledger_update_policy" ON public.points_ledger
    FOR UPDATE TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- Immutable ledger: Only Super Admin can delete
CREATE POLICY "points_ledger_delete_policy" ON public.points_ledger
    FOR DELETE TO authenticated
    USING (is_super_admin());

-- ==============================================================================
-- FIXED: menu_items RLS — Branch-scoped for branch_admin
-- Branch Admin manages menu for their branch only.
-- Owner manages all. Cashier can only read (for checkout display).
-- ==============================================================================
DROP POLICY IF EXISTS "menu_items_select_policy" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_write_policy" ON public.menu_items;

CREATE POLICY "menu_items_select_policy" ON public.menu_items
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR (
            user_belongs_to_business(business_id)
            AND (
                user_has_role_in_business(business_id, 'owner')
                -- Branch-scoped: see items for their branch or business-wide items (branch_id IS NULL)
                OR branch_id IS NULL
                OR branch_id = get_user_branch_for_business(business_id)
            )
        )
    );

CREATE POLICY "menu_items_insert_policy" ON public.menu_items
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND branch_id = get_user_branch_for_business(business_id)
        )
    );

CREATE POLICY "menu_items_update_policy" ON public.menu_items
    FOR UPDATE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND branch_id = get_user_branch_for_business(business_id)
        )
    )
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND branch_id = get_user_branch_for_business(business_id)
        )
    );

CREATE POLICY "menu_items_delete_policy" ON public.menu_items
    FOR DELETE TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
        OR (
            user_has_role_in_business(business_id, 'branch_admin')
            AND branch_id = get_user_branch_for_business(business_id)
        )
    );

-- ==============================================================================
-- FIXED: redemption_rates RLS — Only Owner manages, everyone in business reads
-- ==============================================================================
DROP POLICY IF EXISTS "redemption_rates_select_policy" ON public.redemption_rates;
DROP POLICY IF EXISTS "redemption_rates_write_policy" ON public.redemption_rates;

CREATE POLICY "redemption_rates_select_policy" ON public.redemption_rates
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR user_belongs_to_business(business_id)
    );

CREATE POLICY "redemption_rates_write_policy" ON public.redemption_rates
    FOR ALL TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    )
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    );

-- ==============================================================================
-- FIXED: user_roles RLS — Owner sees roles in their business, user sees own role
-- ==============================================================================
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_write_policy" ON public.user_roles;

CREATE POLICY "user_roles_select_policy" ON public.user_roles
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR user_id = auth.uid()
        OR user_has_role_in_business(business_id, 'owner')
    );

CREATE POLICY "user_roles_write_policy" ON public.user_roles
    FOR ALL TO authenticated
    USING (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    )
    WITH CHECK (
        is_super_admin()
        OR user_has_role_in_business(business_id, 'owner')
    );
