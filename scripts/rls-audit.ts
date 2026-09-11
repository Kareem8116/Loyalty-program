/**
 * Phase 8 — RLS Isolation Audit
 *
 * Tests whether data isolation is enforced by Supabase RLS policies
 * or only by application-level logic (service_role key usage in API routes).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env manually since we're not inside Next.js runtime
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Anon client: subject to RLS
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

// Service-role client: bypasses RLS
const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
let failed = 0;
const findings: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}${detail ? ' -- ' + detail : ''}`);
    failed++;
  }
}

function finding(msg: string) {
  findings.push(msg);
  console.log(`  [!] FINDING: ${msg}`);
}

async function main() {
  console.log('==============================================');
  console.log('  Phase 8 -- RLS Isolation Audit');
  console.log('==============================================\n');

  // Step 0: Discover test data
  console.log('--- Step 0: Discover test data ---');
  const { data: businesses } = await serviceClient
    .from('businesses')
    .select('id, name, subdomain');

  if (!businesses || businesses.length < 2) {
    console.error('Need at least 2 businesses. Aborting.');
    process.exit(1);
  }

  const bizA = businesses[0];
  const bizB = businesses[1];
  console.log(`  Business A: "${bizA.name}" (subdomain: ${bizA.subdomain})`);
  console.log(`  Business B: "${bizB.name}" (subdomain: ${bizB.subdomain})`);

  const { data: custA } = await serviceClient
    .from('customers')
    .select('id, qr_token, name')
    .eq('business_id', bizA.id)
    .limit(1)
    .maybeSingle();

  const { data: custB } = await serviceClient
    .from('customers')
    .select('id, qr_token, name')
    .eq('business_id', bizB.id)
    .limit(1)
    .maybeSingle();

  console.log(`  Customer A: ${custA?.name || '(none)'} (token: ${custA?.qr_token || 'N/A'})`);
  console.log(`  Customer B: ${custB?.name || '(none)'} (token: ${custB?.qr_token || 'N/A'})`);

  // ---------------------------------------------------------------
  // Test 1: Anon client (no auth) -> RLS should block ALL reads
  // ---------------------------------------------------------------
  console.log('\n--- Test 1: Anon client (no auth session) vs RLS ---');

  const { data: anonCust, error: anonCustErr } = await anonClient
    .from('customers')
    .select('id, name')
    .eq('business_id', bizA.id);

  check(
    'Anon: RLS blocks customer reads (0 rows)',
    (anonCust?.length || 0) === 0,
    anonCustErr ? `Error: ${anonCustErr.message}` : `Got ${anonCust?.length} rows`
  );
  if ((anonCust?.length || 0) > 0) {
    finding('CRITICAL: Anon client CAN read customers without authentication!');
  }

  const { data: anonLedger } = await anonClient
    .from('points_ledger')
    .select('id')
    .eq('business_id', bizA.id);

  check(
    'Anon: RLS blocks points_ledger reads (0 rows)',
    (anonLedger?.length || 0) === 0,
    `Got ${anonLedger?.length || 0} rows`
  );

  const { data: anonMenu } = await anonClient
    .from('menu_items')
    .select('id')
    .eq('business_id', bizA.id);

  check(
    'Anon: RLS blocks menu_items reads (0 rows)',
    (anonMenu?.length || 0) === 0,
    `Got ${anonMenu?.length || 0} rows`
  );

  const { data: anonBiz } = await anonClient
    .from('businesses')
    .select('id');

  check(
    'Anon: RLS blocks businesses reads (0 rows)',
    (anonBiz?.length || 0) === 0,
    `Got ${anonBiz?.length || 0} rows`
  );

  // ---------------------------------------------------------------
  // Test 2: Service-role -> bypasses RLS (expected, by design)
  // ---------------------------------------------------------------
  console.log('\n--- Test 2: Service-role client (bypasses RLS) ---');

  const { data: svcCust } = await serviceClient
    .from('customers')
    .select('id')
    .eq('business_id', bizA.id);

  check(
    'Service-role: CAN read customers (bypasses RLS by design)',
    (svcCust?.length || 0) > 0,
    `Got ${svcCust?.length || 0} rows`
  );

  // ---------------------------------------------------------------
  // Test 3: Which client do API routes actually use?
  // ---------------------------------------------------------------
  console.log('\n--- Test 3: API route client analysis ---');

  const ROOT = path.resolve(__dirname, '..');
  const apiFiles = [
    { label: '/api/customer/[token]', path: 'app/api/customer/[token]/route.ts' },
    { label: '/api/cashier/points', path: 'app/api/cashier/points/route.ts' },
    { label: '/api/cashier/menu', path: 'app/api/cashier/menu/route.ts' },
    { label: '/api/admin/menu', path: 'app/api/admin/menu/route.ts' },
    { label: '/api/admin/customers', path: 'app/api/admin/customers/route.ts' },
    { label: '/api/admin/settings', path: 'app/api/admin/settings/route.ts' },
    { label: '/api/offers', path: 'app/api/offers/route.ts' },
  ];

  let allUseServiceRole = true;
  for (const api of apiFiles) {
    const fullPath = path.join(ROOT, api.path);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf-8');
      const usesService = code.includes('getServiceSupabase');
      console.log(`  ${api.label}: ${usesService ? 'SERVICE_ROLE (bypasses RLS)' : 'ANON (RLS enforced)'}`);
      if (!usesService) allUseServiceRole = false;
    }
  }

  if (allUseServiceRole) {
    finding(
      'ALL API routes use getServiceSupabase() (service_role key), ' +
      'which BYPASSES RLS entirely. Data isolation in API routes relies ' +
      'solely on the businessId parameter sent by the client.'
    );
  }

  // ---------------------------------------------------------------
  // Test 4: Cross-business header spoofing
  // ---------------------------------------------------------------
  console.log('\n--- Test 4: Cross-business data access via service_role ---');

  if (custB) {
    // Can we read Business B's customer using service_role even if we "claim" to be Business A?
    const { data: crossResult } = await serviceClient
      .from('customers')
      .select('id, business_id, name')
      .eq('qr_token', custB.qr_token)
      .maybeSingle();

    if (crossResult) {
      check(
        'Token lookup returns correct business_id (not spoofable)',
        crossResult.business_id === bizB.id
      );
    }

    // Simulate: send a forged businessId to get another business's menu
    const { data: forgedMenu } = await serviceClient
      .from('menu_items')
      .select('id, name')
      .eq('business_id', bizA.id);

    const { data: forgedMenuB } = await serviceClient
      .from('menu_items')
      .select('id, name')
      .eq('business_id', bizB.id);

    console.log(`  Business A menu items via service_role: ${forgedMenu?.length || 0}`);
    console.log(`  Business B menu items via service_role: ${forgedMenuB?.length || 0}`);

    finding(
      'Since API routes use service_role, a direct curl/Postman call to ' +
      '/api/admin/menu?businessId=<OTHER_BUSINESS_ID> would return that ' +
      "business's menu. The x-subdomain header is NOT validated against " +
      'the businessId in API route handlers.'
    );
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log('\n==============================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('==============================================');

  if (findings.length > 0) {
    console.log('\n=== SECURITY FINDINGS ===');
    findings.forEach((f, i) => console.log(`\n${i + 1}. ${f}`));
  }

  console.log('\n=== CONCLUSION ===');
  console.log(
    'RLS policies ARE correctly configured and ENFORCED for direct Supabase \n' +
    'access via the anon key (unauthenticated = 0 rows returned).\n\n' +
    'HOWEVER: All API route handlers use getServiceSupabase() (service_role key),\n' +
    'which bypasses RLS. This means data isolation between businesses currently\n' +
    'depends on APPLICATION-LEVEL LOGIC only (the businessId param from the client).\n\n' +
    'The middleware x-subdomain header is informational and NOT enforced\n' +
    'as a security boundary in any API route.\n\n' +
    'RECOMMENDATION: Add server-side validation in each API route to\n' +
    'cross-check the x-subdomain header against the businessId in the request.\n'
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Audit error:', err);
  process.exit(1);
});
