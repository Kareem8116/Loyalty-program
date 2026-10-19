/**
 * Apply Phase 11 migration via Supabase REST API
 * Run: node --env-file=.env.local scripts/apply-phase11-migration.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const SQL_STATEMENTS = [
  // 11.2 indexes
  `CREATE INDEX IF NOT EXISTS idx_menu_items_business_branch ON public.menu_items (business_id, branch_id NULLS FIRST, name)`,
  `CREATE INDEX IF NOT EXISTS idx_redemption_rates_business ON public.redemption_rates (business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_business_branding_business ON public.business_branding (business_id)`,
  
  // 11.3 idempotency index (only if column exists)
  `DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='points_ledger' AND column_name='idempotency_key'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_points_ledger_idempotency ON public.points_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;
    END IF;
  END $$`,
  
  // 11.5 cashier daily stats index  
  `CREATE INDEX IF NOT EXISTS idx_points_ledger_cashier_daily ON public.points_ledger (business_id, created_by, created_at DESC) WHERE points_change > 0`,
  
  // 11.5 customer balance index
  `CREATE INDEX IF NOT EXISTS idx_points_ledger_customer_balance ON public.points_ledger (business_id, customer_id, created_at DESC)`,
  
  // 11.5 FIFO index (confirm from Phase 14)
  `DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='points_ledger' AND column_name='remaining_amount'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_points_ledger_fifo ON public.points_ledger (business_id, customer_id, created_at ASC) WHERE remaining_amount > 0;
    END IF;
  END $$`,
  
  // 11.4 autovacuum on default partition
  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'points_ledger_default' AND relnamespace = 'public'::regnamespace) THEN
      ALTER TABLE public.points_ledger_default SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005, autovacuum_vacuum_cost_delay = 2);
    END IF;
  END $$`,
];

async function applySQL(sql, description) {
  try {
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      // Try direct approach
      console.log(`  ⚠️  RPC failed for "${description}": ${error.message}`);
      console.log(`  ℹ️  Please run this SQL manually in Supabase Dashboard > SQL Editor:`);
      console.log(`  ${sql.trim().substring(0, 100)}...`);
      return false;
    }
    console.log(`  ✅ ${description}`);
    return true;
  } catch (err) {
    console.log(`  ⚠️  Error for "${description}": ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n=== Phase 11 Migration via REST API ===\n');
  
  // Test connection first
  const { data, error } = await supabase.from('businesses').select('id').limit(1);
  if (error) {
    console.error('❌ Cannot connect to Supabase:', error.message);
    process.exit(1);
  }
  console.log('✅ Supabase connection OK\n');
  
  // Print SQL for manual execution in Supabase Dashboard
  console.log('📋 SQL to run in Supabase Dashboard > SQL Editor:\n');
  console.log('--- START SQL ---');
  console.log(`
-- Phase 11: Performance Indexes & Queue Support
-- Run this in Supabase Dashboard > SQL Editor

-- 11.2: Menu items index
CREATE INDEX IF NOT EXISTS idx_menu_items_business_branch
  ON public.menu_items (business_id, branch_id NULLS FIRST, name);

-- 11.2: Redemption rates index  
CREATE INDEX IF NOT EXISTS idx_redemption_rates_business
  ON public.redemption_rates (business_id);

-- 11.2: Business branding index
CREATE INDEX IF NOT EXISTS idx_business_branding_business
  ON public.business_branding (business_id);

-- 11.3: Idempotency key index (if column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='points_ledger' AND column_name='idempotency_key'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_points_ledger_idempotency
      ON public.points_ledger (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- 11.5: Cashier daily stats covering index
CREATE INDEX IF NOT EXISTS idx_points_ledger_cashier_daily
  ON public.points_ledger (business_id, created_by, created_at DESC)
  WHERE points_change > 0;

-- 11.5: Customer balance covering index
CREATE INDEX IF NOT EXISTS idx_points_ledger_customer_balance
  ON public.points_ledger (business_id, customer_id, created_at DESC);

-- 11.5: FIFO expiry index (if remaining_amount column exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='points_ledger' AND column_name='remaining_amount'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_points_ledger_fifo
      ON public.points_ledger (business_id, customer_id, created_at ASC)
      WHERE remaining_amount > 0;
  END IF;
END $$;

-- 11.4: Autovacuum on default partition (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'points_ledger_default' AND relnamespace = 'public'::regnamespace) THEN
    ALTER TABLE public.points_ledger_default SET (
      autovacuum_vacuum_scale_factor = 0.01,
      autovacuum_analyze_scale_factor = 0.005,
      autovacuum_vacuum_cost_delay = 2
    );
  END IF;
END $$;

-- Verify partitioning
SELECT relname, relkind,
  CASE relkind WHEN 'p' THEN 'PARTITIONED' WHEN 'r' THEN 'REGULAR' ELSE relkind::text END as type
FROM pg_class
WHERE relname LIKE 'points_ledger%' AND relnamespace = 'public'::regnamespace
ORDER BY relname;
`);
  console.log('--- END SQL ---\n');
  
  console.log('✅ Phase 11 code changes applied to codebase.');
  console.log('📌 Apply the SQL above in Supabase Dashboard to complete the database portion.');
}

main().catch(console.error);
