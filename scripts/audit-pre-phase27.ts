import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function audit() {
  console.log('====================================================');
  console.log('  AUDIT PRE-PHASE 27: VERIFYING ALL PRIOR PHASES   ');
  console.log('====================================================\n');

  // 1. Check businesses.timezone
  const { data: bData, error: bErr } = await supabase.from('businesses').select('id, timezone').limit(1);
  if (bErr) {
    console.log('❌ businesses.timezone:', bErr.message);
  } else {
    console.log('✅ businesses.timezone exists.');
  }

  // 2. Check user_roles.per_transaction_points_limit
  const { data: rData, error: rErr } = await supabase.from('user_roles').select('id, per_transaction_points_limit').limit(1);
  if (rErr) {
    console.log('❌ user_roles.per_transaction_points_limit:', rErr.message);
  } else {
    console.log('✅ user_roles.per_transaction_points_limit exists.');
  }

  // 3. Check points_ledger.remaining_amount & expires_at
  const { data: lData, error: lErr } = await supabase.from('points_ledger').select('id, remaining_amount, expires_at').limit(1);
  if (lErr) {
    console.log('❌ points_ledger remaining_amount / expires_at:', lErr.message);
  } else {
    console.log('✅ points_ledger remaining_amount & expires_at exist.');
  }

  // 4. Check customer_auth_links table
  const { data: calData, error: calErr } = await supabase.from('customer_auth_links').select('id').limit(1);
  if (calErr) {
    console.log('❌ customer_auth_links table:', calErr.message);
  } else {
    console.log('✅ customer_auth_links table exists.');
  }

  // 5. Check routes
  const cashierLoginPath = path.join(process.cwd(), 'app/cashier/login/page.tsx');
  if (fs.existsSync(cashierLoginPath)) {
    console.log('✅ /cashier/login route exists.');
  } else {
    console.log('❌ /cashier/login route DOES NOT exist (Phase 4.0).');
  }

  // 6. Check cashier logout in app/cashier/page.tsx
  const cashierPagePath = path.join(process.cwd(), 'app/cashier/page.tsx');
  const cashierPageCode = fs.readFileSync(cashierPagePath, 'utf8');
  if (cashierPageCode.includes('handleLogout') || cashierPageCode.includes('LogOut')) {
    console.log('✅ /cashier has session logout button (Phase 4.0.1).');
  } else {
    console.log('❌ /cashier DOES NOT have session logout button (Phase 4.0.1).');
  }

  // 7. Check cashier management in app/admin/page.tsx
  const adminPagePath = path.join(process.cwd(), 'app/admin/page.tsx');
  const adminPageCode = fs.readFileSync(adminPagePath, 'utf8');
  if (adminPageCode.includes('handleAddCashier') || adminPageCode.includes('cashierEmail')) {
    console.log('✅ /admin has Add Cashier form (Phase 5.3.1).');
  } else {
    console.log('❌ /admin DOES NOT have Add Cashier form (Phase 5.3.1).');
  }

  console.log('\n====================================================\n');
}

audit().catch(console.error);
