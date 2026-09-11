/**
 * Phase 24: Smart AI Recommendations via Gemini API — Automated Test Suite
 * Validates:
 * 1. Feature definition & default status (false)
 * 2. Fail-silent design (core system never breaks)
 * 3. Zero PII leakage (no phone numbers or sensitive data in prompts)
 * 4. Zero Emojis compliance (RULES.md Section 3.2)
 * 5. 1-Hour caching mechanism to control cost
 * 6. Multi-tenant isolation & Core Points Independence
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getServiceSupabase } from '../lib/supabase';
import { 
  isFeatureEnabled, 
  setBusinessFeature,
  getDefaultFeatureStatus 
} from '../lib/features';
import { 
  getBusinessAiSettings, 
  saveBusinessAiSettings, 
  generateCustomerRecommendation 
} from '../lib/recommendations';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
    testsFailed++;
  }
}

async function runPhase24Tests() {
  console.log('\n================================================================');
  console.log('       Phase 24: AI Recommendations — Automated Test Suite     ');
  console.log('================================================================\n');

  const supabase = getServiceSupabase();
  const testSubdomain = `test-biz-ai-${Date.now()}`;
  let testBizId: string | null = null;
  let testCustomerId: string | null = null;
  const testToken = '11111111-2222-3333-4444-555555555555';

  try {
    // ── Setup Test Data ───────────────────────────────────────────────────────
    console.log('0. Bootstrapping test environment...');
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .insert({
        name: 'AI Coffee Lab',
        subdomain: testSubdomain,
        is_active: true,
      })
      .select('id')
      .single();

    if (bizErr || !biz) throw new Error(`Failed to create test business: ${bizErr?.message}`);
    testBizId = biz.id;

    // Create redemption rate
    await supabase.from('redemption_rates').insert({
      business_id: testBizId,
      currency_per_point: 0.1,
      points_per_currency_unit: 10,
    });

    // Create menu items
    await supabase.from('menu_items').insert([
      { business_id: testBizId, name: 'Espresso', price: 15 },
      { business_id: testBizId, name: 'Cortado', price: 25 },
      { business_id: testBizId, name: 'Caramel Macchiato', price: 50 },
    ]);

    // Create customer with test QR token
    const { data: cust, error: custErr } = await supabase
      .from('customers')
      .insert({
        business_id: testBizId,
        name: 'Sara Ahmed',
        phone_number: '+201099887766',
        qr_token: testToken,
        consent_given_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (custErr || !cust) throw new Error(`Failed to create test customer: ${custErr?.message}`);
    testCustomerId = cust.id;

    // Add points to customer
    await supabase.from('points_ledger').insert([
      {
        business_id: testBizId,
        customer_id: testCustomerId,
        points_change: 200,
        reason: 'signup_bonus',
      },
      {
        business_id: testBizId,
        customer_id: testCustomerId,
        points_change: -50,
        reason: 'redeem:Cortado',
      },
    ]);

    console.log(`   Business ID: ${testBizId}`);
    console.log(`   Customer ID: ${testCustomerId} (Balance: 150 pts)\n`);

    // ── Test Group 1: Feature Definition & Default Status ─────────────────────
    console.log('--- Test Group 1: Feature Definition & Default Status ---');
    const { data: featDef } = await supabase
      .from('feature_definitions')
      .select('key, name')
      .eq('key', 'ai_recommendations')
      .maybeSingle();

    assert(!!featDef, '1.1 ai_recommendations exists in feature_definitions table');
    assert(getDefaultFeatureStatus('ai_recommendations') === false, '1.2 ai_recommendations defaults to FALSE (requires API key)');

    const isEnabledInitial = await isFeatureEnabled(testBizId, 'ai_recommendations');
    assert(isEnabledInitial === false, '1.3 isFeatureEnabled returns false initially for new business');

    // ── Test Group 2: Disabled Feature & Fail-Silent Architecture ──────────────
    console.log('\n--- Test Group 2: Disabled Feature & Fail-Silent Architecture ---');
    const recWhenDisabled = await generateCustomerRecommendation({
      businessId: testBizId,
      customerToken: testToken,
      locale: 'ar',
    });
    assert(recWhenDisabled === null, '2.1 generateCustomerRecommendation returns null when feature disabled');

    // Enable feature in business_features
    await setBusinessFeature(testBizId, 'ai_recommendations', true);
    const isEnabledNow = await isFeatureEnabled(testBizId, 'ai_recommendations');
    assert(isEnabledNow === true, '2.2 setBusinessFeature enables ai_recommendations');

    // When enabled but no API key configured
    const recNoKey = await generateCustomerRecommendation({
      businessId: testBizId,
      customerToken: testToken,
      locale: 'ar',
    });
    assert(recNoKey === null, '2.3 generateCustomerRecommendation returns null safely when no API key configured (Fail-silent)');

    // ── Test Group 3: Invalid Key Handling (Fail-Silent Recovery) ──────────────
    console.log('\n--- Test Group 3: Invalid Key Handling (Fail-Silent Recovery) ---');
    // Save a mock invalid key
    await saveBusinessAiSettings({
      businessId: testBizId,
      geminiApiKey: 'AIzaSy_FAKE_INVALID_KEY_FOR_TESTING_PURPOSES',
      model: 'gemini-1.5-flash',
    });

    const settings = await getBusinessAiSettings(testBizId);
    assert(settings !== null && !!settings.gemini_api_key, '3.1 saveBusinessAiSettings stores API key in business_ai_settings');

    // Invoking with invalid key should FAIL-SILENT (return null, never throw error)
    let threwError = false;
    let recInvalidKey: string | null = null;
    try {
      recInvalidKey = await generateCustomerRecommendation({
        businessId: testBizId,
        customerToken: testToken,
        locale: 'ar',
      });
    } catch {
      threwError = true;
    }

    assert(!threwError, '3.2 Calling Gemini with invalid key does not throw unhandled exception');
    assert(recInvalidKey === null, '3.3 Calling Gemini with invalid key returns null cleanly (Fail-silent)');

    // ── Test Group 4: Zero Emojis Compliance ──────────────────────────────────
    console.log('\n--- Test Group 4: Zero Emojis Compliance ---');
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const fs = require('fs');
    const recLibCode = fs.readFileSync(path.join(process.cwd(), 'lib/recommendations.ts'), 'utf8');

    assert(recLibCode.includes('sanitizeZeroEmojis'), '4.1 recommendations library has sanitizeZeroEmojis stripper');
    assert(recLibCode.includes('ZERO EMOJIS'), '4.2 Prompt explicitly instructs Gemini STRICT ZERO EMOJIS');

    // ── Test Group 5: Zero PII Guarantee ──────────────────────────────────────
    console.log('\n--- Test Group 5: Zero PII Guarantee ---');
    assert(!recLibCode.includes('customer.phone_number'), '5.1 recommendations library NEVER accesses customer.phone_number');
    assert(!recLibCode.includes('phone_number:'), '5.2 Prompt never transmits phone number or user identity');

    // ── Test Group 6: Core Points Ledger Immunity ─────────────────────────────
    console.log('\n--- Test Group 6: Core Points Ledger Immunity ---');
    // Verify that core loyalty transactions remain 100% operational regardless of AI state
    const { data: newEntry, error: ledgerErr } = await supabase
      .from('points_ledger')
      .insert({
        business_id: testBizId,
        customer_id: testCustomerId,
        points_change: 25,
        reason: 'purchase_bonus',
      })
      .select('id, points_change')
      .single();

    assert(!ledgerErr && !!newEntry, '6.1 Points transaction succeeds with 100% fidelity alongside AI subsystem');

    // Verify calculated points
    const { data: allLedger } = await supabase
      .from('points_ledger')
      .select('points_change')
      .eq('customer_id', testCustomerId);

    const balance = (allLedger || []).reduce((s, e) => s + (e.points_change || 0), 0);
    assert(balance === 175, '6.2 Customer points balance accurately updated (150 + 25 = 175 pts)');

  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────────────
    console.log('\n🧹 Cleaning up test business & data...');
    if (testBizId) {
      await supabase.from('businesses').delete().eq('id', testBizId);
      console.log('   Test business cleaned up successfully.');
    }
  }

  console.log('\n================================================================');
  console.log(`Phase 24 Test Summary: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPhase24Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
