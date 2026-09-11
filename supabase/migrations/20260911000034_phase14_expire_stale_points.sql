-- ==============================================================================
-- Phase 14 (Part 2): expire_stale_points() DB function + pg_cron schedule
-- PLAN.md 14.4: Runs daily at 03:00 UTC to mark expired earn records.
-- ==============================================================================

-- 1. Create the expire_stale_points() stored function
-- Uses a single atomic UPDATE + INSERT pattern:
--   - Finds earn rows where expires_at < NOW() AND remaining_amount > 0
--   - For each, inserts a deduction ledger row with reason='expired'
--   - Zeroes out remaining_amount on the original earn row
-- Runs inside a single transaction for atomicity.
CREATE OR REPLACE FUNCTION public.expire_stale_points()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
BEGIN
  FOR _row IN
    SELECT
      pl.id,
      pl.business_id,
      pl.branch_id,
      pl.customer_id,
      pl.remaining_amount
    FROM public.points_ledger pl
    WHERE
      pl.expires_at IS NOT NULL
      AND pl.expires_at < NOW()
      AND pl.remaining_amount > 0
      AND pl.points_change > 0   -- earn rows only
    FOR UPDATE SKIP LOCKED        -- skip rows already being processed
  LOOP
    -- Insert an expiry deduction record
    INSERT INTO public.points_ledger (
      business_id,
      branch_id,
      customer_id,
      points_change,
      reason,
      created_by,
      expires_at
    ) VALUES (
      _row.business_id,
      _row.branch_id,
      _row.customer_id,
      -_row.remaining_amount,   -- negative = deduction
      'expired',
      NULL,                     -- system-triggered, no human actor
      NULL
    );

    -- Zero out the consumed earn row
    UPDATE public.points_ledger
    SET remaining_amount = 0
    WHERE id = _row.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_points() IS
  'Phase 14.4: Called by pg_cron daily to expire stale points. '
  'For each earn row with expires_at < NOW() and remaining_amount > 0, '
  'inserts a deduction row (reason=expired) and zeroes remaining_amount.';

-- 2. Schedule via pg_cron (runs at 03:00 UTC daily)
-- NOTE: pg_cron must be enabled in Supabase Dashboard → Database → Extensions first.
-- This SELECT is safe to run even if pg_cron is not yet enabled; it will simply fail
-- gracefully if the cron schema does not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove any existing schedule with this name before recreating
    PERFORM cron.unschedule('expire-points-daily')
    FROM cron.job
    WHERE jobname = 'expire-points-daily';

    PERFORM cron.schedule(
      'expire-points-daily',
      '0 3 * * *',
      $cron$ SELECT public.expire_stale_points(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not found. Skipping cron schedule. '
      'Enable pg_cron in Supabase Dashboard → Extensions and re-run this migration.';
  END IF;
END;
$$;
