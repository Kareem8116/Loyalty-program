/**
 * Phase 13 Test Suite: Customer Data Collection Consent
 * 
 * Tests:
 * 1. lib/customer: createCustomer fails without consentGiven
 * 2. lib/customer: createCustomer succeeds with consentGiven: true and sets consent_given_at
 * 3. Database: verify consent_given_at is stored in Supabase
 * 4. API: POST /api/admin/customers rejects requests without consentGiven: true (400 Bad Request)
 * 5. API: POST /api/admin/customers succeeds with consentGiven: true
 * 6. API: GET /api/admin/customers returns consent_given_at in customer payload
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createCustomer } from '../lib/customer';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}${detail ? ' -- ' + detail : ''}`);
    failed++;
  }
}

const cleanupCustomerIds: string[] = [];
const cleanupBusinessIds: string[] = [];
const cleanupUserIds: string[] = [];

async function main() {
  console.log('\n=============================================================');
  console.log('       Phase 13: Customer Consent Verification Test Suite     ');
  console.log('=============================================================\n');

  try {
    // 0. Setup test business and owner
    const testSubdomain = `test-consent-${Date.now()}`;
    const { data: business, error: bErr } = await adminClient
      .from('businesses')
      .insert({
        name: 'Consent Test Coffee',
        subdomain: testSubdomain,
        is_active: true,
      })
      .select()
      .single();

    if (bErr || !business) {
      throw new Error(`Failed to create test business: ${bErr?.message}`);
    }
    cleanupBusinessIds.push(business.id);

    // Create owner auth user
    const ownerEmail = `owner-${Date.now()}@testconsent.com`;
    const ownerPassword = 'TestPassword123!';
    const { data: authUser, error: aErr } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
    });
    if (aErr || !authUser.user) {
      throw new Error(`Failed to create test owner user: ${aErr?.message}`);
    }
    cleanupUserIds.push(authUser.user.id);

    // Assign owner role
    const { error: rErr } = await adminClient.from('user_roles').insert({
      user_id: authUser.user.id,
      business_id: business.id,
      role: 'owner',
    });
    if (rErr) throw new Error(`Failed to assign owner role: ${rErr.message}`);

    // Sign in to get JWT token
    const clientAuth = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data: sessionData, error: sErr } = await clientAuth.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    if (sErr || !sessionData.session) {
      throw new Error(`Failed to sign in as owner: ${sErr?.message}`);
    }
    const token = sessionData.session.access_token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Host': `${testSubdomain}.localhost:3000`,
    };

    console.log('--- Section 1: Direct lib/customer Unit Validation ---');

    // Test 1: createCustomer without consentGiven
    let caughtConsentErr = false;
    try {
      await createCustomer({
        businessId: business.id,
        name: 'No Consent Customer',
        phoneNumber: '+201000000001',
      });
    } catch (e: any) {
      caughtConsentErr = true;
      assert(
        e.message.includes('Customer consent is required'),
        '1.1: createCustomer throws error when consentGiven is omitted',
        e.message
      );
    }
    assert(caughtConsentErr, '1.2: createCustomer prevents saving when consent is missing');

    // Test 2: createCustomer with consentGiven: false
    let caughtFalseErr = false;
    try {
      await createCustomer({
        businessId: business.id,
        name: 'False Consent Customer',
        phoneNumber: '+201000000002',
        consentGiven: false,
      });
    } catch (e: any) {
      caughtFalseErr = true;
      assert(
        e.message.includes('Customer consent is required'),
        '1.3: createCustomer throws error when consentGiven is explicitly false',
        e.message
      );
    }
    assert(caughtFalseErr, '1.4: createCustomer prevents saving when consentGiven is false');

    // Test 3: createCustomer with consentGiven: true
    const validCust = await createCustomer({
      businessId: business.id,
      name: 'Valid Consenting Customer',
      phoneNumber: '+201000000003',
      consentGiven: true,
    });
    cleanupCustomerIds.push(validCust.id);

    assert(Boolean(validCust.id), '1.5: createCustomer succeeds with consentGiven: true');
    assert(
      Boolean(validCust.consent_given_at),
      '1.6: Customer record contains consent_given_at timestamp',
      `consent_given_at: ${validCust.consent_given_at}`
    );

    // Verify in DB directly
    const { data: dbCustomer, error: dbErr } = await adminClient
      .from('customers')
      .select('id, name, consent_given_at')
      .eq('id', validCust.id)
      .single();

    assert(!dbErr && Boolean(dbCustomer), '1.7: Customer fetched directly from DB');
    assert(
      Boolean(dbCustomer?.consent_given_at),
      '1.8: consent_given_at is persisted in Supabase database table',
      `DB consent_given_at: ${dbCustomer?.consent_given_at}`
    );

    console.log('\n--- Section 2: API Route Validation (/api/admin/customers) ---');

    // Test 4: POST /api/admin/customers without consentGiven
    const apiNoConsentRes = await fetch(`${BASE_URL}/api/admin/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        businessId: business.id,
        name: 'API No Consent',
        phoneNumber: '+201000000004',
      }),
    });
    const apiNoConsentData = await apiNoConsentRes.json();
    assert(
      apiNoConsentRes.status === 400 && apiNoConsentData.success === false,
      '2.1: API rejects customer registration without consentGiven with status 400',
      `Status: ${apiNoConsentRes.status}, Error: ${apiNoConsentData.error}`
    );

    // Test 5: POST /api/admin/customers with consentGiven: false
    const apiFalseConsentRes = await fetch(`${BASE_URL}/api/admin/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        businessId: business.id,
        name: 'API False Consent',
        phoneNumber: '+201000000005',
        consentGiven: false,
      }),
    });
    const apiFalseConsentData = await apiFalseConsentRes.json();
    assert(
      apiFalseConsentRes.status === 400 && apiFalseConsentData.success === false,
      '2.2: API rejects customer registration when consentGiven is false',
      `Status: ${apiFalseConsentRes.status}, Error: ${apiFalseConsentData.error}`
    );

    // Test 6: POST /api/admin/customers with consentGiven: true
    const apiValidRes = await fetch(`${BASE_URL}/api/admin/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        businessId: business.id,
        name: 'API Valid Customer',
        phoneNumber: '+201000000006',
        consentGiven: true,
      }),
    });
    const apiValidData = await apiValidRes.json();
    assert(
      apiValidRes.status === 200 && apiValidData.success === true,
      '2.3: API accepts customer registration with consentGiven: true',
      `Status: ${apiValidRes.status}`
    );
    if (apiValidData.customer?.id) {
      cleanupCustomerIds.push(apiValidData.customer.id);
    }
    assert(
      Boolean(apiValidData.customer?.consent_given_at),
      '2.4: API response includes consent_given_at timestamp'
    );

    // Test 7: GET /api/admin/customers verifies consent_given_at is returned in list
    const getListRes = await fetch(`${BASE_URL}/api/admin/customers?businessId=${business.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    const getListData = await getListRes.json();
    assert(
      getListRes.status === 200 && Array.isArray(getListData.customers),
      '2.5: GET /api/admin/customers returns list of customers'
    );
    const listedCust = getListData.customers?.find((c: any) => c.id === apiValidData.customer?.id);
    assert(
      Boolean(listedCust && listedCust.consent_given_at),
      '2.6: GET list includes consent_given_at for consenting customers',
      `Listed customer consent: ${listedCust?.consent_given_at}`
    );

  } catch (err: any) {
    console.error('❌ Unexpected error in test suite:', err);
    failed++;
  } finally {
    console.log('\n--- Cleanup ---');
    if (cleanupCustomerIds.length > 0) {
      await adminClient.from('customers').delete().in('id', cleanupCustomerIds);
      console.log(`  Cleaned up ${cleanupCustomerIds.length} test customers`);
    }
    if (cleanupBusinessIds.length > 0) {
      await adminClient.from('businesses').delete().in('id', cleanupBusinessIds);
      console.log(`  Cleaned up ${cleanupBusinessIds.length} test businesses`);
    }
    if (cleanupUserIds.length > 0) {
      for (const uid of cleanupUserIds) {
        await adminClient.auth.admin.deleteUser(uid);
      }
      console.log(`  Cleaned up ${cleanupUserIds.length} test auth users`);
    }
  }

  console.log('\n=============================================================');
  console.log(`Phase 13 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
