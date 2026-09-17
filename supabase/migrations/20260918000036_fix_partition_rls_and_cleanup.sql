-- ==============================================================================
-- Migration: Fix Partition RLS and Automatic Cleanup of points_ledger Partitions
-- Resolves Supabase Database Linter Error: rls_disabled_in_public
-- ==============================================================================

-- 1. Enable RLS on the default partition
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'points_ledger_default'
    ) THEN
        ALTER TABLE public.points_ledger_default ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 2. Clean up orphaned partitions from old tests AND enable RLS on active partitions
DO $$
DECLARE
    tbl RECORD;
    v_biz_id UUID;
    v_biz_text TEXT;
BEGIN
    FOR tbl IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename LIKE 'points_ledger_%'
          AND tablename <> 'points_ledger_default'
    ) LOOP
        -- Extract the business UUID from 'points_ledger_xxxxxxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx'
        v_biz_text := replace(substring(tbl.tablename from '^points_ledger_(.*)$'), '_', '-');
        
        BEGIN
            v_biz_id := v_biz_text::uuid;
            
            -- If the business does not exist anymore (orphaned test data), drop the partition
            IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = v_biz_id) THEN
                EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE;', tbl.tablename);
                RAISE NOTICE 'Dropped orphaned partition table: %', tbl.tablename;
            ELSE
                -- Active business partition: Enable Row Level Security
                EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
                RAISE NOTICE 'Enabled RLS on active partition: %', tbl.tablename;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If name doesn't match standard UUID pattern, simply ensure RLS is enabled
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
        END;
    END LOOP;
END $$;

-- 3. Ensure ANY remaining points_ledger partition has RLS enabled
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename LIKE 'points_ledger_%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    END LOOP;
END $$;

-- 4. Update create_business_partition() trigger function to ALWAYS enable RLS on new partitions
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
    -- Ensure RLS is enabled on the newly created partition table immediately
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', partition_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add drop_business_partition() trigger function to drop the partition when a business is deleted
CREATE OR REPLACE FUNCTION public.drop_business_partition()
RETURNS TRIGGER AS $$
DECLARE
    partition_name TEXT;
BEGIN
    partition_name := 'points_ledger_' || replace(OLD.id::text, '-', '_');
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE;', partition_name);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_drop_business_partition ON public.businesses;
CREATE TRIGGER trigger_drop_business_partition
    AFTER DELETE ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION public.drop_business_partition();
