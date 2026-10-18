import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { redis } from '../lib/redis';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = 'http://localhost:3000';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

interface TestResult {
  suite: string;
  test: string;
  status: 'PASS' | 'FAIL';
  details?: string;
  durationMs?: number;
}

const results: TestResult[] = [];

function record(suite: string, test: string, passed: boolean, details?: string) {
  results.push({
    suite,
    test,
    status: passed ? 'PASS' : 'FAIL',
    details,
  });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${suite}] ${test} ${details ? '(' + details + ')' : ''}`);
}

async function getAuthToken(email: string, pass: string): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
  if (error || !data.session) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

async function api(path: string, options: {
  method?: string;
  token?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let json: any = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, ok: res.ok, data: json };
}

async function runAllTests() {
  console.log('🧪 Starting Full Interactive Application Test Suite across all Roles & Operations...\n');

  // Fetch Demo Coffee ID
  const { data: demoBiz } = await adminClient
    .from('businesses')
    .select('id, name')
    .eq('subdomain', 'demo-coffee')
    .single();

  if (!demoBiz) throw new Error('Demo Coffee not found in database');
  const demoBizId = demoBiz.id;
  console.log(`📍 Testing against Business: ${demoBiz.name} (${demoBizId})\n`);

  // Ensure branch exists
  const { data: demoBranch } = await adminClient
    .from('branches')
    .select('id')
    .eq('business_id', demoBizId)
    .single();
  const branchId = demoBranch?.id;

  // ══════════════════════════════════════════════════════════════
  // SUITE 1: SUPER ADMIN FLOW
  // ══════════════════════════════════════════════════════════════
  console.log('👑 SUITE 1: Super Admin Flow');
  let saToken = '';
  try {
    saToken = await getAuthToken('superadmin@loyalty.system', 'SuperAdmin2026!');
    record('Super Admin', 'Authentication', true, 'Token acquired');
  } catch (err: any) {
    record('Super Admin', 'Authentication', false, err.message);
  }

  if (saToken) {
    // 1.1 List businesses
    const listRes = await api('/api/super-admin/businesses', { token: saToken });
    record('Super Admin', 'GET /api/super-admin/businesses', listRes.status === 200 && Array.isArray(listRes.data?.businesses), `Found ${listRes.data?.businesses?.length} businesses`);

    // 1.2 Create new business
    const testSubdomain = `test-e2e-${Date.now()}`;
    const createBizRes = await api('/api/super-admin/businesses', {
      method: 'POST',
      token: saToken,
      body: {
        name: 'E2E Automated Cafe',
        subdomain: testSubdomain,
        branchName: 'Downtown Test Branch',
        ownerEmail: `owner.${testSubdomain}@test.loyalty`,
        ownerPassword: 'Password123!',
        ownerPhone: '01099998888',
      }
    });
    record('Super Admin', 'POST /api/super-admin/businesses (Create Business)', createBizRes.status === 201 || createBizRes.status === 200, `Created ${testSubdomain}`);
    const createdBizId = createBizRes.data?.business?.id;

    // 1.3 Update Branding for Demo Coffee
    const brandRes = await api(`/api/super-admin/businesses/${demoBizId}/branding`, {
      method: 'PUT',
      token: saToken,
      body: {
        display_name: 'Demo Coffee Roasters Ameba',
        primary_color: '#3b82f6',
        accent_color: '#10b981',
        layout_variant: 'centered-classic',
      }
    });
    record('Super Admin', 'PUT /api/super-admin/businesses/[id]/branding', brandRes.status === 200 && brandRes.data?.success, 'Branding updated');

    // 1.4 Get & toggle features
    const featRes = await api(`/api/super-admin/features?businessId=${demoBizId}`, { token: saToken });
    record('Super Admin', 'GET /api/super-admin/features', featRes.status === 200 && Array.isArray(featRes.data?.definitions), `Found ${featRes.data?.definitions?.length} feature defs`);

    const toggleFeatRes = await api('/api/super-admin/features', {
      method: 'PATCH',
      token: saToken,
      body: {
        businessId: demoBizId,
        featureKey: 'offers',
        isEnabled: true,
      }
    });
    record('Super Admin', 'PATCH /api/super-admin/features (Toggle Feature)', toggleFeatRes.status === 200 && toggleFeatRes.data?.success, 'Feature toggled');

    // 1.5 List users
    const usersRes = await api('/api/super-admin/users', { token: saToken });
    record('Super Admin', 'GET /api/super-admin/users', usersRes.status === 200 && Array.isArray(usersRes.data?.users), `Found ${usersRes.data?.users?.length} users`);

    // 1.6 Super Admin Profile
    const profileRes = await api('/api/account/profile', { token: saToken });
    record('Super Admin', 'GET /api/account/profile', profileRes.status === 200 && profileRes.data?.success, `Email: ${profileRes.data?.profile?.email}`);
  }

  // ══════════════════════════════════════════════════════════════
  // SUITE 2: OWNER / STORE ADMIN FLOW
  // ══════════════════════════════════════════════════════════════
  console.log('\n🏪 SUITE 2: Owner / Store Admin Flow');
  let ownerToken = '';
  try {
    ownerToken = await getAuthToken('owner.test@pointat.net', 'Password123!');
    record('Owner', 'Authentication', true, 'Token acquired');
  } catch (err: any) {
    record('Owner', 'Authentication', false, err.message);
  }

  if (ownerToken) {
    // 2.1 Menu Items
    const menuListRes = await api(`/api/admin/menu?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/menu', menuListRes.status === 200 && Array.isArray(menuListRes.data?.items), `Found ${menuListRes.data?.items?.length} items`);

    // 2.2 Add Menu Item
    const addMenuRes = await api('/api/admin/menu', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        branchId,
        name: 'V60 Specialty Coffee',
        price: 85.0,
      }
    });
    record('Owner', 'POST /api/admin/menu (Add Item)', addMenuRes.status === 201 || (addMenuRes.status === 200 && addMenuRes.data?.success), 'Added V60 Specialty Coffee');
    const createdItemId = addMenuRes.data?.item?.id;

    // 2.3 Menu Item Validation
    const invalidMenuRes = await api('/api/admin/menu', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        name: '',
        price: -10,
      }
    });
    record('Owner', 'POST /api/admin/menu Validation (Negative price / blank name rejected)', invalidMenuRes.status === 400, `Rejected with status ${invalidMenuRes.status}`);

    // 2.4 Delete Menu Item
    if (createdItemId) {
      const delMenuRes = await api(`/api/admin/menu?id=${createdItemId}&businessId=${demoBizId}`, {
        method: 'DELETE',
        token: ownerToken,
      });
      record('Owner', 'DELETE /api/admin/menu', delMenuRes.status === 200 && delMenuRes.data?.success, 'Item deleted');
    }

    // 2.5 Offers
    const offersRes = await api(`/api/offers?businessId=${demoBizId}&admin=true`, { token: ownerToken });
    record('Owner', 'GET /api/offers?admin=true', offersRes.status === 200 && Array.isArray(offersRes.data?.offers), `Found ${offersRes.data?.offers?.length} offers`);

    // 2.6 Add Offer
    const todayStr = new Date().toISOString().split('T')[0];
    const endStr = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const addOfferRes = await api('/api/offers', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        title: 'عرض تجريبي جديد (Automated Offer)',
        description: 'خصم 20% على القهوة المختصة',
        type: 'special',
        startDate: todayStr,
        endDate: endStr,
      }
    });
    record('Owner', 'POST /api/offers (Add Offer)', addOfferRes.status === 200 && addOfferRes.data?.success, 'Offer created');
    const createdOfferId = addOfferRes.data?.offer?.id;

    // 2.7 Delete Offer
    if (createdOfferId) {
      const delOfferRes = await api(`/api/offers?id=${createdOfferId}&businessId=${demoBizId}`, {
        method: 'DELETE',
        token: ownerToken,
      });
      record('Owner', 'DELETE /api/offers', delOfferRes.status === 200 && delOfferRes.data?.success, 'Offer deleted');
    }

    // 2.8 Tiers
    const tiersRes = await api(`/api/admin/tiers?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/tiers', tiersRes.status === 200 && Array.isArray(tiersRes.data?.tiers), `Found ${tiersRes.data?.tiers?.length} tiers`);

    const uniqueTierName = `بلاتيني ${Date.now()}`;
    const addTierRes = await api('/api/admin/tiers', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        name: uniqueTierName,
        minPointsEarned: 2500,
        benefitsDescription: 'خصم 15% وتوصيل مجاني',
      }
    });
    record('Owner', 'POST /api/admin/tiers (Add Tier)', addTierRes.status === 200 && addTierRes.data?.success, `Tier added: ${uniqueTierName} (status ${addTierRes.status}, ${JSON.stringify(addTierRes.data)})`);
    const createdTierId = addTierRes.data?.tier?.id;

    if (createdTierId) {
      const delTierRes = await api('/api/admin/tiers', {
        method: 'DELETE',
        token: ownerToken,
        body: {
          businessId: demoBizId,
          tierId: createdTierId,
        }
      });
      record('Owner', 'DELETE /api/admin/tiers', delTierRes.status === 200 && delTierRes.data?.success, 'Tier deleted');
    }

    // 2.9 Cashiers
    const cashiersRes = await api(`/api/admin/cashiers?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/cashiers', cashiersRes.status === 200 && Array.isArray(cashiersRes.data?.cashiers), `Found ${cashiersRes.data?.cashiers?.length} cashiers`);

    // 2.10 Customers
    const custRes = await api(`/api/admin/customers?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/customers', custRes.status === 200 && Array.isArray(custRes.data?.customers), `Found ${custRes.data?.customers?.length} customers`);

    // Add Customer
    const testPhone = `010${Math.floor(10000000 + Math.random() * 90000000)}`;
    const addCustRes = await api('/api/admin/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        name: 'عميل آلي تجريبي',
        phoneNumber: testPhone,
        consentGiven: true,
      }
    });
    record('Owner', 'POST /api/admin/customers (Register Customer)', addCustRes.status === 200 && addCustRes.data?.success, `Customer registered: ${testPhone}`);

    // Customer Validation (Reject invalid phone)
    const invalidCustRes = await api('/api/admin/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        name: 'Invalid Phone User',
        phoneNumber: '12345',
        consentGiven: true,
      }
    });
    record('Owner', 'POST /api/admin/customers Validation (Invalid phone rejected)', invalidCustRes.status === 400, `Rejected with status ${invalidCustRes.status}`);

    // 2.11 Settings
    const setRes = await api(`/api/admin/settings?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/settings', setRes.status === 200 && setRes.data?.success, `Points rate: ${setRes.data?.rates?.points_per_currency_unit}`);

    const putSetRes = await api('/api/admin/settings', {
      method: 'PUT',
      token: ownerToken,
      body: {
        businessId: demoBizId,
        pointsPerCurrencyUnit: 1.0,
        currencyPerPoint: 0.1,
        pointsExpiryMonths: 12,
        redemptionType: 'both',
      }
    });
    record('Owner', 'PUT /api/admin/settings', putSetRes.status === 200 && putSetRes.data?.success, 'Settings updated');

    // 2.12 Referral Settings
    const refRes = await api(`/api/admin/referral?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/referral', refRes.status === 200 && refRes.data?.success, `Referrer bonus: ${refRes.data?.settings?.referrer_bonus_points}`);

    // 2.13 Analytics, Audit Log, Daily Review
    const analyticsRes = await api(`/api/admin/analytics?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/analytics', analyticsRes.status === 200 && analyticsRes.data?.success, 'Analytics loaded');

    const auditRes = await api(`/api/admin/audit-log?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/audit-log', auditRes.status === 200 && Array.isArray(auditRes.data?.logs), `Found ${auditRes.data?.logs?.length} audit logs`);

    const dailyRes = await api(`/api/admin/daily-review?businessId=${demoBizId}`, { token: ownerToken });
    record('Owner', 'GET /api/admin/daily-review', dailyRes.status === 200 && dailyRes.data?.success, 'Daily review loaded');
  }

  // ══════════════════════════════════════════════════════════════
  // SUITE 3: CASHIER FLOW
  // ══════════════════════════════════════════════════════════════
  console.log('\n💳 SUITE 3: Cashier Flow');
  let cashierToken = '';
  try {
    cashierToken = await getAuthToken('cashier.test@pointat.net', 'Password123!');
    record('Cashier', 'Authentication', true, 'Token acquired');
  } catch (err: any) {
    record('Cashier', 'Authentication', false, err.message);
  }

  if (cashierToken) {
    // 3.1 Cashier Menu
    const cashMenuRes = await api(`/api/cashier/menu?businessId=${demoBizId}`, { token: cashierToken });
    record('Cashier', 'GET /api/cashier/menu', cashMenuRes.status === 200 && Array.isArray(cashMenuRes.data?.menuItems), `Found ${cashMenuRes.data?.menuItems?.length} items`);

    // 3.2 Customer Lookup by QR Token
    const custLookupRes = await api('/api/customer/QGSBREA6Q');
    const customerObj = custLookupRes.data?.customer;
    record('Cashier', 'Lookup Customer by QR (QGSBREA6Q)', custLookupRes.status === 200 && customerObj?.name === 'كريم يونس التجريبي', `Found: ${customerObj?.name}, Points: ${customerObj?.points_balance}`);
    const testCustomerId = customerObj?.id;

    if (testCustomerId) {
      const initialBalance = customerObj?.points_balance || 0;

      // 3.3 Issue Points (+50 points)
      const issueRes = await api('/api/cashier/points', {
        method: 'POST',
        token: cashierToken,
        body: {
          businessId: demoBizId,
          branchId,
          customerId: testCustomerId,
          pointsChange: 50,
          reason: 'purchase',
          invoiceReference: `INV-${Date.now()}`,
        }
      });
      record('Cashier', 'POST /api/cashier/points (Issue +50 Points)', issueRes.status === 200 && issueRes.data?.success, `New balance returned: ${issueRes.data?.newBalance}`);

      // 3.4 Validation: Missing invoice reference must fail
      const failInvoiceRes = await api('/api/cashier/points', {
        method: 'POST',
        token: cashierToken,
        body: {
          businessId: demoBizId,
          branchId,
          customerId: testCustomerId,
          pointsChange: 50,
          reason: 'purchase',
        }
      });
      record('Cashier', 'POST /api/cashier/points Validation (Invoice reference required for points)', failInvoiceRes.status === 400 && failInvoiceRes.data?.errorCode === 'INVOICE_REQUIRED', `Properly rejected: ${failInvoiceRes.data?.error}`);

      // 3.5 Redemption OTP Generation
      const otpRes = await api('/api/cashier/redemption-otp', {
        method: 'POST',
        token: cashierToken,
        body: {
          businessId: demoBizId,
          customerId: testCustomerId,
        }
      });
      record('Cashier', 'POST /api/cashier/redemption-otp (Request Redemption OTP)', otpRes.status === 200 || otpRes.status === 429, `Status: ${otpRes.status}, Data: ${JSON.stringify(otpRes.data)}`);

      // Fetch the OTP from Redis
      const cleanPhone = '201012345678';
      let generatedOtp: string | null = null;
      try {
        const rawOtp = await redis.get(`phone_otp:${cleanPhone}`);
        if (rawOtp) {
          const parsed = typeof rawOtp === 'string' ? JSON.parse(rawOtp) : rawOtp;
          generatedOtp = parsed.otp || parsed;
        }
      } catch (err: any) {
        console.log('Redis lookup note:', err.message);
      }

      // 3.6 Redeem Points (-20 points)
      if (generatedOtp) {
        const redeemRes = await api('/api/cashier/points', {
          method: 'POST',
          token: cashierToken,
          body: {
            businessId: demoBizId,
            branchId,
            customerId: testCustomerId,
            pointsChange: -20,
            reason: 'redemption',
            redemptionOtp: generatedOtp,
          }
        });
        record('Cashier', 'POST /api/cashier/points (Redeem 20 Points with OTP)', redeemRes.status === 200 && redeemRes.data?.success, `Points deducted. Balance: ${redeemRes.data?.newBalance}`);
      } else {
        // Test that redemption WITHOUT otp is rejected with 403
        const rejectNoOtp = await api('/api/cashier/points', {
          method: 'POST',
          token: cashierToken,
          body: {
            businessId: demoBizId,
            branchId,
            customerId: testCustomerId,
            pointsChange: -20,
            reason: 'redemption',
          }
        });
        record('Cashier', 'POST /api/cashier/points Security (Redemption without OTP rejected)', rejectNoOtp.status === 403, `Correctly blocked: ${rejectNoOtp.data?.error}`);
      }

      // 3.7 Over-Redemption Protection
      const overRedeemRes = await api('/api/cashier/points', {
        method: 'POST',
        token: cashierToken,
        body: {
          businessId: demoBizId,
          branchId,
          customerId: testCustomerId,
          pointsChange: -999999,
          reason: 'redemption',
          redemptionOtp: '999999',
        }
      });
      record('Cashier', 'POST /api/cashier/points (Over-Redeem Protection)', overRedeemRes.status === 400 || overRedeemRes.status === 403, `Blocked over-redemption: ${overRedeemRes.data?.error}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SUITE 4: CUSTOMER FLOW
  // ══════════════════════════════════════════════════════════════
  console.log('\n👤 SUITE 4: Customer Flow');
  // 4.1 Card details
  const cardRes = await api('/api/customer/QGSBREA6Q');
  const custCard = cardRes.data?.customer;
  record('Customer', 'GET /api/customer/[token] (Card details)', cardRes.status === 200 && custCard?.name === 'كريم يونس التجريبي', `Customer: ${custCard?.name}, Points: ${custCard?.points_balance}`);

  // 4.2 History
  const histRes = await api('/api/customer/QGSBREA6Q/history');
  record('Customer', 'GET /api/customer/[token]/history (Transaction history)', histRes.status === 200 && Array.isArray(histRes.data?.transactions), `Found ${histRes.data?.transactions?.length} transactions in ledger`);

  // 4.3 Offers for customer
  const custOffersRes = await api(`/api/offers?businessId=${demoBizId}`);
  record('Customer', 'GET /api/offers (Public customer offers)', custOffersRes.status === 200 && Array.isArray(custOffersRes.data?.offers), `Active offers: ${custOffersRes.data?.offers?.length}`);

  // 4.4 Recommendations
  const recRes = await api('/api/customer/QGSBREA6Q/recommendation');
  record('Customer', 'GET /api/customer/[token]/recommendation', recRes.status === 200 || recRes.status === 403, `Recommendation endpoint accessible (Status ${recRes.status})`);

  // ══════════════════════════════════════════════════════════════
  // SUITE 5: SECURITY & ROLE ISOLATION
  // ══════════════════════════════════════════════════════════════
  console.log('\n🛡️ SUITE 5: Security & Role Isolation');
  // 5.1 Unauthenticated requests to protected endpoints
  const noAuthMenu = await api(`/api/admin/menu?businessId=${demoBizId}`);
  record('Security', 'Unauthenticated call to /api/admin/menu returns 401', noAuthMenu.status === 401, `Status: ${noAuthMenu.status}`);

  const noAuthSA = await api('/api/super-admin/businesses');
  record('Security', 'Unauthenticated call to /api/super-admin/businesses returns 401', noAuthSA.status === 401, `Status: ${noAuthSA.status}`);

  // 5.2 Cashier cannot access Super Admin
  if (cashierToken) {
    const cashierToSA = await api('/api/super-admin/businesses', { token: cashierToken });
    record('Security', 'Cashier blocked from /api/super-admin/businesses (403)', cashierToSA.status === 403, `Status: ${cashierToSA.status}`);
  }

  // 5.3 Owner cannot access Super Admin
  if (ownerToken) {
    const ownerToSA = await api('/api/super-admin/businesses', { token: ownerToken });
    record('Security', 'Owner blocked from /api/super-admin/businesses (403)', ownerToSA.status === 403, `Status: ${ownerToSA.status}`);
  }

  // 5.4 Cross-tenant tampering: Owner of Demo Coffee cannot query another business
  if (ownerToken) {
    const fakeBizId = '00000000-0000-0000-0000-000000000000';
    const crossTenantRes = await api(`/api/admin/menu?businessId=${fakeBizId}`, { token: ownerToken });
    record('Security', 'Cross-tenant access blocked (403)', crossTenantRes.status === 403, `Status: ${crossTenantRes.status}`);
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`📊 FINAL TEST REPORT: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  if (failed > 0) {
    console.log(`❌ FAILED TESTS (${failed}):`);
    results.filter(r => r.status === 'FAIL').forEach(f => {
      console.log(`  - [${f.suite}] ${f.test}: ${f.details || 'Failed'}`);
    });
  } else {
    console.log('🎉 ALL TESTS PASSED PERFECTLY!');
  }
  console.log('══════════════════════════════════════════════════════════════\n');
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
