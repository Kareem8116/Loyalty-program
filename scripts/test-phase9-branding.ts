/**
 * Phase 9.6.1 & 9.7: Automated Test Suite for Business Branding,
 * Layout Variants, Contrast Verification, and Tenant Isolation.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  checkColorContrast,
  slugifySubdomain,
  APPROVED_FONTS,
  DEFAULT_BRANDING,
} from '../lib/branding';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}${detail ? ' -- ' + detail : ''}`);
    failed++;
  }
}

async function main() {
  console.log('\n=============================================================');
  console.log('  Phase 9 Test: Business Branding, Layout Variants & Isolation');
  console.log('=============================================================\n');

  // ---------------------------------------------------------------------------
  // Test 1: Subdomain Auto-Slugifier (Phase 9.4)
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Subdomain Auto-Slugification ---');
  assert(slugifySubdomain('Coffee Corner') === 'coffee-corner', 'Space to hyphen: "Coffee Corner" -> "coffee-corner"');
  assert(slugifySubdomain('Cafe & Bistro 2026!') === 'cafe-bistro-2026', 'Special chars stripped: "Cafe & Bistro 2026!" -> "cafe-bistro-2026"');
  assert(slugifySubdomain('---Leading and Trailing---') === 'leading-and-trailing', 'Dashes trimmed');

  // ---------------------------------------------------------------------------
  // Test 2: Accessibility Contrast Check WCAG AA (Phase 9.5.2)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Accessibility Contrast Check (WCAG AA) ---');
  // High contrast color: dark brown on white
  const highContrast = checkColorContrast('#3E2723');
  assert(highContrast.passesAA === true, 'Dark brown (#3E2723) passes AA contrast threshold');
  assert(highContrast.ratio >= 4.5, `Contrast ratio >= 4.5:1 (Got ${highContrast.ratio}:1)`);

  // Low contrast color: light yellow on white
  const lowContrast = checkColorContrast('#FFFF88');
  assert(lowContrast.passesAA === false, 'Light yellow (#FFFF88) fails AA contrast threshold');
  assert(!!lowContrast.warning, 'Low contrast produces warning message');
  assert(!!lowContrast.suggestedColor, 'Low contrast provides suggested alternative color');

  // ---------------------------------------------------------------------------
  // Test 3: Approved Font Family Enforcement (Phase 9.5)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Approved Font List ---');
  assert(APPROVED_FONTS.includes('Inter'), 'Approved fonts contains Inter');
  assert(APPROVED_FONTS.includes('Cairo'), 'Approved fonts contains Cairo');
  assert(APPROVED_FONTS.includes('Roboto'), 'Approved fonts contains Roboto');
  assert(APPROVED_FONTS.includes('Tajawal'), 'Approved fonts contains Tajawal');

  // ---------------------------------------------------------------------------
  // Test 4: Two Businesses with Distinct Branding Identities (Phase 9.6.1)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Create Two Distinct Branded Businesses ---');
  const testSuffix = Date.now().toString(36);
  const biz1Subdomain = `brand-a-${testSuffix}`;
  const biz2Subdomain = `brand-b-${testSuffix}`;

  // Create Business 1
  const { data: biz1, error: biz1Err } = await adminClient
    .from('businesses')
    .insert({ name: 'Roast & Toast Cafe', subdomain: biz1Subdomain, is_active: true })
    .select()
    .single();
  assert(!biz1Err && !!biz1, 'Business 1 created successfully', biz1Err?.message);

  // Create Business 2
  const { data: biz2, error: biz2Err } = await adminClient
    .from('businesses')
    .insert({ name: 'Green Juice Bar', subdomain: biz2Subdomain, is_active: true })
    .select()
    .single();
  assert(!biz2Err && !!biz2, 'Business 2 created successfully', biz2Err?.message);

  if (biz1 && biz2) {
    // -------------------------------------------------------------------------
    // Test 5: Branding Customization per Business
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Distinct Branding Persistence ---');
    
    // Identity 1: Warm Brown theme with 'qr-top' variant
    const identity1 = {
      business_id: biz1.id,
      display_name: 'Roast & Toast Specialty Coffee',
      primary_color: '#3E2723',
      accent_color: '#D7CCC8',
      font_family: 'Cairo',
      layout_variant: 'qr-top',
    };

    // Identity 2: Emerald theme with 'horizontal-offers' variant
    const identity2 = {
      business_id: biz2.id,
      display_name: 'Green Oasis Juice',
      primary_color: '#064E3B',
      accent_color: '#6EE7B7',
      font_family: 'Roboto',
      layout_variant: 'horizontal-offers',
    };

    // Upsert Branding for both
    const { error: br1Err } = await adminClient.from('business_branding').upsert(identity1);
    assert(!br1Err, 'Branding 1 upserted successfully', br1Err?.message);

    const { error: br2Err } = await adminClient.from('business_branding').upsert(identity2);
    assert(!br2Err, 'Branding 2 upserted successfully', br2Err?.message);

    // Verify retrieval of branding
    const { data: retrieved1 } = await adminClient
      .from('business_branding')
      .select('*')
      .eq('business_id', biz1.id)
      .single();

    const { data: retrieved2 } = await adminClient
      .from('business_branding')
      .select('*')
      .eq('business_id', biz2.id)
      .single();

    assert(retrieved1?.display_name === 'Roast & Toast Specialty Coffee', 'Biz 1 display_name matches custom branding');
    assert(retrieved1?.layout_variant === 'qr-top', 'Biz 1 layout_variant is qr-top');
    assert(retrieved1?.font_family === 'Cairo', 'Biz 1 font_family is Cairo');

    assert(retrieved2?.display_name === 'Green Oasis Juice', 'Biz 2 display_name matches custom branding');
    assert(retrieved2?.layout_variant === 'horizontal-offers', 'Biz 2 layout_variant is horizontal-offers');
    assert(retrieved2?.font_family === 'Roboto', 'Biz 2 font_family is Roboto');

    // -------------------------------------------------------------------------
    // Test 6: Zero Branding Cross-Contamination (Complete Isolation)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Complete Branding Isolation ---');
    assert(retrieved1?.primary_color !== retrieved2?.primary_color, 'Primary colors are completely independent');
    assert(retrieved1?.accent_color !== retrieved2?.accent_color, 'Accent colors are completely independent');
    assert(retrieved1?.layout_variant !== retrieved2?.layout_variant, 'Layout variants are completely independent');

    // -------------------------------------------------------------------------
    // Test 7: Clean up test businesses
    // -------------------------------------------------------------------------
    await adminClient.from('business_branding').delete().in('business_id', [biz1.id, biz2.id]);
    await adminClient.from('businesses').delete().in('id', [biz1.id, biz2.id]);
    console.log('\n[CLEANUP] Test businesses and brandings removed.');
  }

  console.log('\n=============================================================');
  console.log(`  Phase 9 Branding Results: ${passed} passed, ${failed} failed`);
  console.log('=============================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
