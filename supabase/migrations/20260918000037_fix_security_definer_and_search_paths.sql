-- ==============================================================================
-- Migration: Fix Function Search Paths & Revoke Unintended RPC Execution
-- Resolves Supabase Security Linter Warnings:
--   - 0011: function_search_path_mutable
--   - 0028: anon_security_definer_function_executable
--   - 0029: authenticated_security_definer_function_executable (for non-user functions)
-- ==============================================================================

-- 1. Fix Mutable Search Path on update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. Fix Mutable Search Path on create_business_partition
CREATE OR REPLACE FUNCTION public.create_business_partition()
RETURNS TRIGGER AS $$
DECLARE
    partition_name TEXT;
BEGIN
    partition_name := 'points_ledger_' || replace(NEW.id::text, '-', '_');
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.points_ledger FOR VALUES IN (%L)', 
        partition_name, 
        NEW.id
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', partition_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Revoke EXECUTE from anon & authenticated on Trigger & Maintenance Functions
-- These should NEVER be callable via REST API / RPC by any user:
REVOKE EXECUTE ON FUNCTION public.create_business_partition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_points() FROM PUBLIC, anon, authenticated;

-- If rls_auto_enable exists, revoke it as well
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
    ) THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;';
    END IF;
END $$;

-- 4. Revoke EXECUTE from 'anon' (unauthenticated public) on all RLS Helper Functions
-- Anonymous callers have no session (auth.uid() IS NULL) and should never call these:
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_business_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_branch_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role_for_business(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_business(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_role_in_business(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_branch_for_business(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_branch_scoped_role(uuid) FROM PUBLIC, anon;

-- Note: The RLS helper functions retain EXECUTE for 'authenticated' because Postgres
-- evaluates them during RLS policy checks when authenticated users query tables.
-- Each helper function internally scopes its check strictly to WHERE user_id = auth.uid(),
-- preventing any user from accessing or evaluating data outside their own account.
