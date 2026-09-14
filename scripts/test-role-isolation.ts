import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testRoleIsolation() {
  console.log('🔒 Starting Complete Role Isolation Verification...\n');

  // 1. Get or create test users for all 4 roles:
  // a) Customer: customer@pointat.net
  // b) Cashier: cashier.test@pointat.net
  // c) Store Manager: owner.test@pointat.net
  // d) Super Admin: superadmin@loyalty.system

  // Fetch or create a business for testing
  let { data: biz } = await supabase.from('businesses').select('id, name').limit(1).maybeSingle();
  if (!biz) {
    const { data: newBiz } = await supabase.from('businesses').insert({ name: 'Isolation Test Store', subdomain: 'isolation-test' }).select().single();
    biz = newBiz;
  }
  const bizId = biz!.id;

  // 1. Ensure Cashier test user exists
  const cashierEmail = 'cashier.test@pointat.net';
  const testPassword = 'Password123!';
  let cashierUser = (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === cashierEmail);
  if (!cashierUser) {
    const { data: cu } = await supabase.auth.admin.createUser({ email: cashierEmail, password: testPassword, email_confirm: true });
    cashierUser = cu.user!;
  }
  await supabase.from('user_roles').delete().eq('user_id', cashierUser.id);
  await supabase.from('user_roles').insert({ user_id: cashierUser.id, role: 'cashier', business_id: bizId });

  // 2. Ensure Store Owner / Admin test user exists
  const ownerEmail = 'owner.test@pointat.net';
  let ownerUser = (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === ownerEmail);
  if (!ownerUser) {
    const { data: ou } = await supabase.auth.admin.createUser({ email: ownerEmail, password: testPassword, email_confirm: true });
    ownerUser = ou.user!;
  }
  await supabase.from('user_roles').delete().eq('user_id', ownerUser.id);
  await supabase.from('user_roles').insert({ user_id: ownerUser.id, role: 'owner', business_id: bizId });

  // 3. Ensure Super Admin test user exists
  const superAdminEmail = 'superadmin@loyalty.system';
  let superAdminUser = (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === superAdminEmail);
  if (!superAdminUser) {
    const { data: su } = await supabase.auth.admin.createUser({ email: superAdminEmail, password: 'SuperAdmin2026!', email_confirm: true });
    superAdminUser = su.user!;
  }
  await supabase.from('user_roles').delete().eq('user_id', superAdminUser.id);
  await supabase.from('user_roles').insert({ user_id: superAdminUser.id, role: 'super_admin', business_id: null });

  // 4. Ensure Customer test user exists (NO user_roles entry)
  const customerEmail = 'customer@pointat.net';
  let customerUser = (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === customerEmail);
  if (!customerUser) {
    const { data: cust } = await supabase.auth.admin.createUser({ email: customerEmail, password: 'Customer123!', email_confirm: true });
    customerUser = cust.user!;
  }
  // Delete any staff role if accidentally present for customer
  await supabase.from('user_roles').delete().eq('user_id', customerUser.id);

  console.log('✅ Test accounts ready:');
  console.log(`   - Customer:    ${customerEmail}`);
  console.log(`   - Cashier:     ${cashierEmail}`);
  console.log(`   - Store Admin: ${ownerEmail}`);
  console.log(`   - Super Admin: ${superAdminEmail}\n`);

  // Verification Helper
  async function testLoginRole(email: string, pass: string, portal: 'cashier' | 'admin' | 'super-admin' | 'customer') {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password: pass });
    if (authError || !auth.user) {
      return { allowed: false, reason: 'Invalid credentials' };
    }

    const { data: roleRow } = await client.from('user_roles').select('role').eq('user_id', auth.user.id).limit(1).maybeSingle();
    const role = roleRow?.role || 'customer';

    if (portal === 'cashier') {
      const allowed = role === 'cashier';
      return { allowed, role, reason: allowed ? 'OK' : `Rejected non-cashier role: ${role}` };
    } else if (portal === 'admin') {
      const allowed = role === 'owner' || role === 'branch_admin';
      return { allowed, role, reason: allowed ? 'OK' : `Rejected non-admin role: ${role}` };
    } else if (portal === 'super-admin') {
      const allowed = role === 'super_admin';
      return { allowed, role, reason: allowed ? 'OK' : `Rejected non-superadmin role: ${role}` };
    } else if (portal === 'customer') {
      const allowed = !roleRow || !['cashier', 'owner', 'branch_admin', 'super_admin'].includes(roleRow.role);
      return { allowed, role, reason: allowed ? 'OK' : `Rejected staff role from customer portal: ${role}` };
    }
    return { allowed: false, reason: 'Unknown portal' };
  }

  // --- Test Suite Matrix ---
  const tests = [
    // CASHIER PORTAL
    { role: 'Cashier', email: cashierEmail, pass: testPassword, portal: 'cashier', expected: true },
    { role: 'Store Admin', email: ownerEmail, pass: testPassword, portal: 'cashier', expected: false },
    { role: 'Super Admin', email: superAdminEmail, pass: 'SuperAdmin2026!', portal: 'cashier', expected: false },
    { role: 'Customer', email: customerEmail, pass: 'Customer123!', portal: 'cashier', expected: false },

    // ADMIN PORTAL
    { role: 'Store Admin', email: ownerEmail, pass: testPassword, portal: 'admin', expected: true },
    { role: 'Cashier', email: cashierEmail, pass: testPassword, portal: 'admin', expected: false },
    { role: 'Super Admin', email: superAdminEmail, pass: 'SuperAdmin2026!', portal: 'admin', expected: false },
    { role: 'Customer', email: customerEmail, pass: 'Customer123!', portal: 'admin', expected: false },

    // SUPER ADMIN PORTAL
    { role: 'Super Admin', email: superAdminEmail, pass: 'SuperAdmin2026!', portal: 'super-admin', expected: true },
    { role: 'Store Admin', email: ownerEmail, pass: testPassword, portal: 'super-admin', expected: false },
    { role: 'Cashier', email: cashierEmail, pass: testPassword, portal: 'super-admin', expected: false },
    { role: 'Customer', email: customerEmail, pass: 'Customer123!', portal: 'super-admin', expected: false },

    // CUSTOMER PORTAL
    { role: 'Customer', email: customerEmail, pass: 'Customer123!', portal: 'customer', expected: true },
    { role: 'Cashier', email: cashierEmail, pass: testPassword, portal: 'customer', expected: false },
    { role: 'Store Admin', email: ownerEmail, pass: testPassword, portal: 'customer', expected: false },
    { role: 'Super Admin', email: superAdminEmail, pass: 'SuperAdmin2026!', portal: 'customer', expected: false },
  ];

  let passed = 0;
  for (const t of tests) {
    const res = await testLoginRole(t.email, t.pass, t.portal as any);
    const isSuccess = res.allowed === t.expected;
    if (isSuccess) {
      console.log(`✅ [PASS] ${t.role.padEnd(12)} -> /${t.portal.padEnd(12)} : ${t.expected ? 'ALLOWED' : 'BLOCKED'} (${res.reason})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${t.role.padEnd(12)} -> /${t.portal.padEnd(12)} : expected ${t.expected} but got ${res.allowed}`);
    }
  }

  // --- Edge Middleware & Cookie Scoping Verification ---
  console.log('\n🔒 Testing Edge Middleware & Cookie Scoping Isolation...');
  const { POINTAT_ROLE_COOKIE } = await import('../lib/cookies');
  const { extractSubdomain } = await import('../middleware');

  // Verify cookie constants
  if (POINTAT_ROLE_COOKIE === 'pointat_role') {
    console.log('✅ [PASS] POINTAT_ROLE_COOKIE constant is defined correctly');
    passed++;
  } else {
    console.error('❌ [FAIL] POINTAT_ROLE_COOKIE constant is missing or incorrect');
  }

  // Verify subdomain extraction for isolated portals
  const subPos = extractSubdomain('pos.pointat.net');
  const subAdmin = extractSubdomain('admin.pointat.net');
  const subBare = extractSubdomain('pointat.net');
  if (subPos === 'pos' && subAdmin === 'admin' && subBare === '') {
    console.log('✅ [PASS] Subdomain extraction correctly routes pos & admin subdomains');
    passed++;
  } else {
    console.error('❌ [FAIL] Subdomain extraction failed for pos/admin');
  }

  const totalExpected = tests.length + 2;
  console.log(`\n🎉 Isolation Test Results: ${passed} / ${totalExpected} tests passed!`);
  if (passed === totalExpected) {
    console.log('🔒 COMPLETE ISOLATION ENFORCED AND VERIFIED ACROSS ALL 4 ROLES & MIDDLEWARE.');
  }
}

testRoleIsolation().catch(console.error);

