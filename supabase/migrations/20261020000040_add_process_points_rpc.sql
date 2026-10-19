-- ==============================================================================
-- Migration: Phase 11.3 & Phase 4.5 — Atomic Points Transaction Stored Procedure
-- ==============================================================================

-- 1. Function: get_customer_balance
CREATE OR REPLACE FUNCTION public.get_customer_balance(
  p_customer_id UUID,
  p_business_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF p_business_id IS NOT NULL THEN
    SELECT COALESCE(SUM(points_change), 0)
    INTO v_balance
    FROM public.points_ledger
    WHERE customer_id = p_customer_id
      AND business_id = p_business_id;
  ELSE
    SELECT COALESCE(SUM(points_change), 0)
    INTO v_balance
    FROM public.points_ledger
    WHERE customer_id = p_customer_id;
  END IF;

  RETURN v_balance;
END;
$$;

-- 2. Function: process_points_transaction
CREATE OR REPLACE FUNCTION public.process_points_transaction(
  p_business_id UUID,
  p_branch_id UUID,
  p_customer_id UUID,
  p_points_change INTEGER,
  p_reason TEXT,
  p_created_by UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_invoice_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
  v_remaining_amount INTEGER := 0;
  v_points_to_consume INTEGER;
  v_record_id UUID;
  v_earn_record RECORD;
BEGIN
  IF p_points_change = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_POINTS', 'message', 'Points change cannot be zero');
  END IF;

  -- Calculate current balance
  SELECT COALESCE(SUM(points_change), 0)
  INTO v_current_balance
  FROM public.points_ledger
  WHERE customer_id = p_customer_id
    AND business_id = p_business_id;

  -- If deduction, ensure sufficient balance
  IF p_points_change < 0 THEN
    IF v_current_balance < ABS(p_points_change) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INSUFFICIENT_BALANCE',
        'message', 'Insufficient points balance',
        'current_balance', v_current_balance
      );
    END IF;

    -- FIFO consumption from oldest remaining earn rows
    v_points_to_consume := ABS(p_points_change);
    FOR v_earn_record IN
      SELECT id, remaining_amount
      FROM public.points_ledger
      WHERE business_id = p_business_id
        AND customer_id = p_customer_id
        AND remaining_amount > 0
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      IF v_points_to_consume <= 0 THEN
        EXIT;
      END IF;

      IF v_earn_record.remaining_amount <= v_points_to_consume THEN
        UPDATE public.points_ledger
        SET remaining_amount = 0
        WHERE id = v_earn_record.id;
        v_points_to_consume := v_points_to_consume - v_earn_record.remaining_amount;
      ELSE
        UPDATE public.points_ledger
        SET remaining_amount = remaining_amount - v_points_to_consume
        WHERE id = v_earn_record.id;
        v_points_to_consume := 0;
      END IF;
    END LOOP;
  ELSE
    v_remaining_amount := p_points_change;
  END IF;

  -- Insert ledger entry
  INSERT INTO public.points_ledger (
    business_id,
    branch_id,
    customer_id,
    points_change,
    remaining_amount,
    reason,
    created_by,
    expires_at,
    invoice_reference
  ) VALUES (
    p_business_id,
    p_branch_id,
    p_customer_id,
    p_points_change,
    v_remaining_amount,
    p_reason,
    p_created_by,
    p_expires_at,
    p_invoice_reference
  ) RETURNING id INTO v_record_id;

  v_new_balance := v_current_balance + p_points_change;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_record_id,
    'new_balance', v_new_balance
  );
END;
$$;
