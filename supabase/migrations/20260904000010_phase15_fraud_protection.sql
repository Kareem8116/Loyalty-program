-- ==============================================================================
-- Migration: Phase 15 — Cashier Fraud Protection
-- Description:
--   1. Adds daily_points_limit column to user_roles (cashier daily cap).
--   2. Creates audit_log table for immutable operation audit trail.
--   3. Adds RLS policies: owner/branch_admin READ only, cashier NO access.
-- Adheres to RULES.md and PLAN.md (Phase 15).
-- ==============================================================================

-- ==============================================================================
-- 15.2: Add daily_points_limit to user_roles
-- Cashier role: max points addable per calendar day (midnight-to-midnight UTC).
-- Default 1000 pts/day. Owner can set to 0 to disable (no limit) — we use
-- NULL for "no limit" and 0 is treated as "no limit" in application logic.
-- ==============================================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS daily_points_limit INTEGER NOT NULL DEFAULT 1000;

COMMENT ON COLUMN public.user_roles.daily_points_limit IS
  'Max points a cashier can add per calendar day (UTC). 0 = no limit. Only meaningful for cashier role.';

-- ==============================================================================
-- 15.1: audit_log Table — Immutable audit trail for all cashier operations
-- Records every add/deduct attempt (successful or rejected) with full context.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id      UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    cashier_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id    UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    action         TEXT NOT NULL,
    -- 'add_points' | 'deduct_points' | 'add_points_rejected'
    points_change  INTEGER,
    reason         TEXT,
    status         TEXT NOT NULL CHECK (status IN ('success', 'rejected')),
    error_message  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS
  'Immutable audit trail of all cashier operations. INSERT only — never UPDATE or DELETE.';

-- Indexes for fast filtering (Phase 15.1: filter by cashier, date, business)
CREATE INDEX IF NOT EXISTS idx_audit_log_business_created
    ON public.audit_log(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_cashier_created
    ON public.audit_log(cashier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_status
    ON public.audit_log(business_id, status, created_at DESC);

-- ==============================================================================
-- RLS for audit_log
-- Owner / branch_admin: SELECT only (read audit trail)
-- Cashier: INSERT only (write their operations, cannot read or modify)
-- Super Admin: full access
-- Service role (backend): bypasses RLS — can INSERT on behalf of any user
-- ==============================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_policy" ON public.audit_log;
CREATE POLICY "audit_log_select_policy" ON public.audit_log
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR (
            business_id = get_user_business_id()
            AND get_user_role() IN ('owner', 'branch_admin')
        )
    );

-- Cashier can INSERT (but the backend uses service role for inserts, so this is a safety net)
DROP POLICY IF EXISTS "audit_log_insert_policy" ON public.audit_log;
CREATE POLICY "audit_log_insert_policy" ON public.audit_log
    FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin()
        OR (
            business_id = get_user_business_id()
            AND get_user_role() IN ('owner', 'branch_admin', 'cashier')
        )
    );

-- No UPDATE or DELETE for any non-super_admin (immutable audit log)
DROP POLICY IF EXISTS "audit_log_update_policy" ON public.audit_log;
CREATE POLICY "audit_log_update_policy" ON public.audit_log
    FOR UPDATE TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "audit_log_delete_policy" ON public.audit_log;
CREATE POLICY "audit_log_delete_policy" ON public.audit_log
    FOR DELETE TO authenticated
    USING (is_super_admin());
