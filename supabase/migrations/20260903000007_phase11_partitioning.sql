-- ==============================================================================
-- Phase 11: Database Partitioning for points_ledger
-- ==============================================================================

-- 1. Rename existing points_ledger and its indexes/policies
ALTER TABLE public.points_ledger RENAME TO points_ledger_old;

-- 2. Create the new partitioned points_ledger table
CREATE TABLE public.points_ledger (
    id UUID DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    points_change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, business_id)
) PARTITION BY LIST (business_id);

-- 3. Create a default partition
CREATE TABLE public.points_ledger_default PARTITION OF public.points_ledger DEFAULT;

-- 4. Create partitions for all existing businesses
DO $$
DECLARE
    biz RECORD;
    partition_name TEXT;
BEGIN
    FOR biz IN SELECT id FROM public.businesses LOOP
        partition_name := 'points_ledger_' || replace(biz.id::text, '-', '_');
        EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.points_ledger FOR VALUES IN (%L)', partition_name, biz.id);
    END LOOP;
END
$$;

-- 5. Copy data from the old table to the new partitioned table
INSERT INTO public.points_ledger
SELECT * FROM public.points_ledger_old;

-- 6. Drop the old table
DROP TABLE public.points_ledger_old;

-- 7. Enable RLS on the new table
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

-- 8. Re-apply RLS Policies
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

CREATE POLICY "points_ledger_update_policy" ON public.points_ledger
    FOR UPDATE TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

CREATE POLICY "points_ledger_delete_policy" ON public.points_ledger
    FOR DELETE TO authenticated
    USING (is_super_admin());

-- 9. Trigger to auto-create partition for new businesses
CREATE OR REPLACE FUNCTION public.create_business_partition()
RETURNS TRIGGER AS $$
DECLARE
    partition_name TEXT;
BEGIN
    partition_name := 'points_ledger_' || replace(NEW.id::text, '-', '_');
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.points_ledger FOR VALUES IN (%L)', partition_name, NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_business_partition ON public.businesses;
CREATE TRIGGER trigger_create_business_partition
    AFTER INSERT ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION public.create_business_partition();
