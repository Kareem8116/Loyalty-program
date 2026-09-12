import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anonSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface LoginResult {
  roleCookie: string;
  destination: string;
  businessId?: string | null;
  branchId?: string | null;
}

// Emulates the Unified Login smart routing logic exactly as implemented in app/login/page.tsx
async function simulateUnifiedLogin(email: string, password: string): Promise<LoginResult> {
  const { data: authData, error: authError } = await anonSupabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (authError || !authData.user) {
    throw new Error(`Authentication failed: ${authError?.message}`);
  }

  // Mandatory OTP Email Verification Guard check
  const isEmailVerified =
    authData.user.user_metadata?.email_verified === true ||
    (Boolean(authData.user.email_confirmed_at) &&
      authData.user.user_metadata?.email_verified !== false);

  if (!isEmailVerified) {
    throw new Error('Email not verified - should redirect to /verify-email');
  }

  // Query user_roles
  const { data: userRole } = await anonSupabase
    .from('user_roles')
    .select('role, business_id, branch_id')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  const role = userRole?.role;
  let destination = '/my-places';
  let roleCookie = 'customer';

  if (role === 'super_admin') {
    destination = '/super-admin';
    roleCookie = 'super_admin';
  } else if (role === 'owner' || role === 'branch_admin') {
    destination = '/admin';
    roleCookie = role;
  } else if (role === 'cashier') {
    destination = '/cashier';
    roleCookie = 'cashier';
  } else {
    destination = '/my-places';
    roleCookie = 'customer';
  }

  return {
    roleCookie,
    destination,
    businessId: userRole?.business_id ?? null,
    branchId: userRole?.branch_id ?? null,
  };
}

async function runTests() {
  console.log('🧪 Starting Unified Login Logic & Role Routing Verification...\n');

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, extraInfo?: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} ${extraInfo ? `-> ${extraInfo}` : ''}`);
    }
  }

  // 1. Customer test
  try {
    const res = await simulateUnifiedLogin('customer@pointat.net', 'Customer123!');
    assert('Customer routes to /my-places', res.destination === '/my-places', `Got: ${res.destination}`);
    assert('Customer cookie is customer', res.roleCookie === 'customer', `Got: ${res.roleCookie}`);
  } catch (err: any) {
    assert('Customer login execution', false, err.message);
  }

  // 2. Cashier test
  try {
    const res = await simulateUnifiedLogin('cashier.test@pointat.net', 'Password123!');
    assert('Cashier routes to /cashier', res.destination === '/cashier', `Got: ${res.destination}`);
    assert('Cashier cookie is cashier', res.roleCookie === 'cashier', `Got: ${res.roleCookie}`);
  } catch (err: any) {
    assert('Cashier login execution', false, err.message);
  }

  // 3. Store Admin test
  try {
    const res = await simulateUnifiedLogin('owner.test@pointat.net', 'Password123!');
    assert('Store Admin routes to /admin', res.destination === '/admin', `Got: ${res.destination}`);
    assert('Store Admin cookie is owner', res.roleCookie === 'owner', `Got: ${res.roleCookie}`);
  } catch (err: any) {
    assert('Store Admin login execution', false, err.message);
  }

  // 4. Super Admin test
  try {
    const res = await simulateUnifiedLogin('superadmin@loyalty.system', 'SuperAdmin2026!');
    assert('Super Admin routes to /super-admin', res.destination === '/super-admin', `Got: ${res.destination}`);
    assert('Super Admin cookie is super_admin', res.roleCookie === 'super_admin', `Got: ${res.roleCookie}`);
  } catch (err: any) {
    assert('Super Admin login execution', false, err.message);
  }

  console.log(`\n📊 Unified Login Test Results: ${passed}/${total} Passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
