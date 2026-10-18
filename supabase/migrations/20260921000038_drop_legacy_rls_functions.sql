-- ==============================================================================
-- Migration: Legacy RLS Helper Functions — Deprecation Notice (Phase 2 Cleanup)
-- Description: The following legacy functions from migration 20260903000002
--              are superseded by more accurate business-aware functions in
--              20260903000003, but CANNOT be dropped yet because many RLS
--              policies in later phases (Phase 10 partnerships, audit_log, etc.)
--              still depend on them directly.
--
-- ⚠️  DO NOT DROP these functions until all dependent RLS policies are updated:
--       - partnerships: partnerships_super_admin_all, partnerships_owner_select,
--                       partnerships_owner_insert, partnerships_owner_update
--       - partnership_transfers: ptransfers_super_admin_all, ptransfers_owner_*
--       - audit_log: audit_log_select_policy, audit_log_insert_policy
--
-- TODO (Future cleanup): Replace get_user_role() calls in the above policies
--      with user_has_role_in_business(business_id, role) and
--      user_belongs_to_business(business_id), then drop these legacy functions.
-- ==============================================================================

-- This migration is intentionally a no-op. It documents the technical debt.
-- The actual cleanup will happen in a future migration after all policies are updated.
SELECT 'Legacy RLS function cleanup deferred — dependent policies must be updated first' AS notice;

