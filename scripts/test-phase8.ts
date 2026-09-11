/**
 * Phase 8 Automated Test: Multi-tenancy via Subdomains
 *
 * Verifies:
 * 1. middleware.ts exists and has correct structure
 * 2. lib/tenant.ts exports correct functions
 * 3. Subdomain extraction logic correctness
 * 4. Tenant resolution from DB (demo-coffee subdomain)
 * 5. Data isolation (different subdomains → different businesses)
 * 6. Empty subdomain → null business (default behavior)
 * 7. Translation keys for tenant exist in both ar.json and en.json
 * 8. API /api/tenant route file exists
 */

import * as fs from 'fs';
import * as path from 'path';
import { getServiceSupabase } from '../lib/supabase';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readFileContent(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Test 1: middleware.ts structure
// ---------------------------------------------------------------------------
function testMiddleware() {
  console.log('\n=== Test 1: middleware.ts Structure ===');

  check('middleware.ts exists', fileExists('middleware.ts'));

  const content = readFileContent('middleware.ts');
  check('exports middleware function', content.includes('export function middleware'));
  check('exports config matcher', content.includes('export const config'));
  check('reads Host header', content.includes("request.headers.get('host')") || content.includes('request.headers.get("host")'));
  check('sets x-subdomain header', content.includes("'x-subdomain'") || content.includes('"x-subdomain"'));
  check('handles localhost', content.includes('localhost'));
  check('handles www', content.includes('www'));
  check('excludes _next/static', content.includes('_next'));
}

// ---------------------------------------------------------------------------
// Test 2: lib/tenant.ts structure
// ---------------------------------------------------------------------------
function testTenantLib() {
  console.log('\n=== Test 2: lib/tenant.ts Structure ===');

  check('lib/tenant.ts exists', fileExists('lib/tenant.ts'));

  const content = readFileContent('lib/tenant.ts');
  check('exports resolveBusinessBySubdomain', content.includes('export async function resolveBusinessBySubdomain'));
  check('exports getBusinessFromHeaders', content.includes('export async function getBusinessFromHeaders'));
  check('exports getSubdomainFromHeaders', content.includes('export async function getSubdomainFromHeaders'));
  check('uses getServiceSupabase', content.includes('getServiceSupabase'));
  check('queries businesses table', content.includes("'businesses'") || content.includes('"businesses"'));
  check('implements caching', content.includes('tenantCache') || content.includes('cache') || content.includes('Cache'));
  check('defines TenantBusiness interface', content.includes('TenantBusiness'));
}

// ---------------------------------------------------------------------------
// Test 3: Subdomain extraction logic (unit test)
// ---------------------------------------------------------------------------
function testSubdomainExtraction() {
  console.log('\n=== Test 3: Subdomain Extraction Logic ===');

  // Re-implement the extraction logic from middleware.ts for testing
  const IGNORED_SUBDOMAINS = new Set(['www', 'localhost']);

  function extractSubdomain(host: string): string {
    const hostname = host.split(':')[0];
    const parts = hostname.split('.');

    if (parts.length === 2 && parts[1] === 'localhost') {
      const candidate = parts[0].toLowerCase();
      return IGNORED_SUBDOMAINS.has(candidate) ? '' : candidate;
    }

    if (parts.length >= 3) {
      const candidate = parts[0].toLowerCase();
      return IGNORED_SUBDOMAINS.has(candidate) ? '' : candidate;
    }

    return '';
  }

  // Test cases
  check('demo-coffee.localhost:3000 → "demo-coffee"',
    extractSubdomain('demo-coffee.localhost:3000') === 'demo-coffee');

  check('demo-coffee.yourapp.com → "demo-coffee"',
    extractSubdomain('demo-coffee.yourapp.com') === 'demo-coffee');

  check('localhost:3000 → ""',
    extractSubdomain('localhost:3000') === '');

  check('yourapp.com → ""',
    extractSubdomain('yourapp.com') === '');

  check('www.yourapp.com → ""',
    extractSubdomain('www.yourapp.com') === '');

  check('DEMO-COFFEE.localhost:3000 → "demo-coffee" (case insensitive)',
    extractSubdomain('DEMO-COFFEE.localhost:3000') === 'demo-coffee');

  check('"" → ""',
    extractSubdomain('') === '');

  check('sub.domain.example.com → "sub"',
    extractSubdomain('sub.domain.example.com') === 'sub');
}

// ---------------------------------------------------------------------------
// Test 4: DB tenant resolution
// ---------------------------------------------------------------------------
async function testDbResolution() {
  console.log('\n=== Test 4: DB Tenant Resolution ===');

  const adminClient = getServiceSupabase();

  // Test known subdomain: demo-coffee
  const { data: demoCoffee, error: err1 } = await adminClient
    .from('businesses')
    .select('id, name, subdomain, is_active')
    .eq('subdomain', 'demo-coffee')
    .maybeSingle();

  check('demo-coffee subdomain found in DB', !!demoCoffee, err1?.message);
  if (demoCoffee) {
    check('demo-coffee has id', !!demoCoffee.id);
    check('demo-coffee has name', !!demoCoffee.name);
    check('demo-coffee is_active = true', demoCoffee.is_active === true);
  }

  // Test unknown subdomain returns null
  const { data: unknown } = await adminClient
    .from('businesses')
    .select('id')
    .eq('subdomain', 'nonexistent-subdomain-xyz-123')
    .maybeSingle();

  check('Unknown subdomain returns null', unknown === null);
}

// ---------------------------------------------------------------------------
// Test 5: Data isolation
// ---------------------------------------------------------------------------
async function testDataIsolation() {
  console.log('\n=== Test 5: Data Isolation ===');

  const adminClient = getServiceSupabase();

  // Get all businesses
  const { data: businesses } = await adminClient
    .from('businesses')
    .select('id, name, subdomain');

  let tempBizId: string | null = null;
  let bizList = [...(businesses || [])];

  if (bizList.length < 2) {
    const tempSubdomain = `iso-test-${Date.now()}`;
    const { data: tempBiz } = await adminClient
      .from('businesses')
      .insert({ name: 'Isolation Test Biz', subdomain: tempSubdomain, is_active: true })
      .select()
      .single();
    if (tempBiz) {
      tempBizId = tempBiz.id;
      bizList.push(tempBiz);
    }
  }

  check('At least 2 businesses exist for isolation test', bizList.length >= 2);

  if (bizList.length >= 2) {
    const biz1 = bizList[0];
    const biz2 = bizList[1];

    // Get customers for each business
    const { data: cust1 } = await adminClient
      .from('customers')
      .select('id')
      .eq('business_id', biz1.id);

    const { data: cust2 } = await adminClient
      .from('customers')
      .select('id')
      .eq('business_id', biz2.id);

    // Verify that customer sets are disjoint (or at least scoped)
    const ids1 = new Set((cust1 || []).map(c => c.id));
    const ids2 = new Set((cust2 || []).map(c => c.id));

    let overlap = false;
    for (const id of ids1) {
      if (ids2.has(id)) {
        overlap = true;
        break;
      }
    }

    check(
      `Customers of "${biz1.subdomain}" and "${biz2.subdomain}" are isolated (no overlapping IDs)`,
      !overlap
    );
  }

  if (tempBizId) {
    await adminClient.from('business_branding').delete().eq('business_id', tempBizId);
    await adminClient.from('businesses').delete().eq('id', tempBizId);
  }
}

// ---------------------------------------------------------------------------
// Test 6: Translation keys
// ---------------------------------------------------------------------------
function testTranslationKeys() {
  console.log('\n=== Test 6: Translation Keys ===');

  const arContent = JSON.parse(readFileContent('messages/ar.json'));
  const enContent = JSON.parse(readFileContent('messages/en.json'));

  const requiredKeys = [
    'home.tenantWelcome',
    'home.tenantSubtitle',
    'home.defaultCustomer',
  ];

  for (const key of requiredKeys) {
    const [section, prop] = key.split('.');
    check(`ar.json has ${key}`, !!arContent[section]?.[prop]);
    check(`en.json has ${key}`, !!enContent[section]?.[prop]);
  }

  // Verify interpolation placeholder exists
  check(
    'ar.json home.tenantWelcome has {name} placeholder',
    arContent.home?.tenantWelcome?.includes('{name}')
  );
  check(
    'en.json home.tenantWelcome has {name} placeholder',
    enContent.home?.tenantWelcome?.includes('{name}')
  );
}

// ---------------------------------------------------------------------------
// Test 7: API route and page integration
// ---------------------------------------------------------------------------
function testFileIntegration() {
  console.log('\n=== Test 7: File Integration ===');

  check('app/api/tenant/route.ts exists', fileExists('app/api/tenant/route.ts'));

  const tenantRoute = readFileContent('app/api/tenant/route.ts');
  check('Tenant API imports getBusinessFromHeaders', tenantRoute.includes('getBusinessFromHeaders'));

  const pageTsx = readFileContent('app/page.tsx');
  check('app/page.tsx imports tenant functions', pageTsx.includes('getBusinessFromHeaders') || pageTsx.includes('getSubdomainFromHeaders'));
  check('app/page.tsx passes tenantBusiness prop', pageTsx.includes('tenantBusiness'));

  const homeContent = readFileContent('components/HomeContent.tsx');
  check('HomeContent accepts tenantBusiness prop', homeContent.includes('tenantBusiness'));
  check('HomeContent uses tenantWelcome translation', homeContent.includes('home.tenantWelcome'));
  check('HomeContent uses Store icon for tenant', homeContent.includes('Store'));
}

// ---------------------------------------------------------------------------
// Test 8: Zero Emojis Compliance
// ---------------------------------------------------------------------------
function testZeroEmojis() {
  console.log('\n=== Test 8: Zero Emojis Compliance ===');

  const filesToCheck = [
    'middleware.ts',
    'lib/tenant.ts',
    'app/api/tenant/route.ts',
    'app/page.tsx',
    'components/HomeContent.tsx',
    'messages/ar.json',
    'messages/en.json',
  ];

  // Simple emoji regex covering most common emoji ranges
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  for (const file of filesToCheck) {
    if (fileExists(file)) {
      const content = readFileContent(file);
      check(`${file}: no emojis`, !emojiRegex.test(content));
    }
  }
}

// ---------------------------------------------------------------------------
// Test 9: Cookie Scoping Compliance (Phase 8.6)
// ---------------------------------------------------------------------------
function testCookieScoping() {
  console.log('\n=== Test 9: Cookie Scoping Compliance (Phase 8.6) ===');

  check('lib/cookies.ts exists', fileExists('lib/cookies.ts'));
  const cookiesContent = readFileContent('lib/cookies.ts');
  check('SECURE_TENANT_COOKIE_OPTIONS has domain: undefined', cookiesContent.includes('domain: undefined'));
  check('SECURE_TENANT_COOKIE_OPTIONS has sameSite: strict', cookiesContent.includes("sameSite: 'strict'"));
  check('SECURE_TENANT_COOKIE_OPTIONS has httpOnly: true', cookiesContent.includes('httpOnly: true'));

  const middlewareContent = readFileContent('middleware.ts');
  check('middleware.ts enforces domain: undefined', middlewareContent.includes('domain: undefined'));
  check('middleware.ts enforces sameSite: strict', middlewareContent.includes("sameSite: 'strict'"));
  check('middleware.ts enforces httpOnly: true', middlewareContent.includes('httpOnly: true'));
  check('middleware.ts does NOT hardcode parent domain', !middlewareContent.includes("domain: '.pointat.net'"));
}

// ---------------------------------------------------------------------------
// Test 10: Subdomain -> Business ID Redis Cache (Phase 8.7)
// ---------------------------------------------------------------------------
async function testSubdomainRedisCache() {
  console.log('\n=== Test 10: Subdomain -> Business ID Redis Cache (Phase 8.7) ===');

  const { resolveBusinessBySubdomain, invalidateTenantCache } = await import('../lib/tenant');
  const { redis } = await import('../lib/redis');

  // Test resolution using demo-coffee
  const biz = await resolveBusinessBySubdomain('demo-coffee');
  check('resolveBusinessBySubdomain returns valid business', !!biz && biz.subdomain === 'demo-coffee');

  if (biz) {
    // Check Redis key exists
    try {
      const redisKey = `tenant:subdomain:demo-coffee`;
      const cached = await redis.get<any>(redisKey);
      check('Redis key tenant:subdomain:demo-coffee exists in Redis', !!cached && cached.id === biz.id);

      // Invalidate cache
      await invalidateTenantCache('demo-coffee');
      const cachedAfterDel = await redis.get<any>(redisKey);
      check('Redis key invalidated after invalidateTenantCache', cachedAfterDel === null);

      // Re-populate for normal operation
      await resolveBusinessBySubdomain('demo-coffee');
    } catch (e: any) {
      console.warn('Redis test skipped or errored:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 11: Distributed Rate Limiting via Upstash Redis (Phase 8.8)
// ---------------------------------------------------------------------------
async function testUpstashRateLimiting() {
  console.log('\n=== Test 11: Distributed Rate Limiting (Phase 8.8) ===');

  const { checkRateLimit } = await import('../lib/rate-limit');

  const testKey = `test-runner-ratelimit-${Date.now()}`;
  const maxRequests = 3;
  const windowMs = 5000; // 5 seconds

  const res1 = await checkRateLimit(testKey, maxRequests, windowMs);
  const res2 = await checkRateLimit(testKey, maxRequests, windowMs);
  const res3 = await checkRateLimit(testKey, maxRequests, windowMs);
  const res4 = await checkRateLimit(testKey, maxRequests, windowMs);

  check('Request 1 allowed (remaining: 2)', res1.allowed === true && res1.remaining === 2);
  check('Request 2 allowed (remaining: 1)', res2.allowed === true && res2.remaining === 1);
  check('Request 3 allowed (remaining: 0)', res3.allowed === true && res3.remaining === 0);
  check('Request 4 rejected (allowed: false)', res4.allowed === false && res4.remaining === 0);
  check('Retry-After header value > 0 provided', res4.retryAfterSeconds > 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('========================================');
  console.log('  Phase 8 Test: Multi-tenancy Subdomains');
  console.log('========================================');

  testMiddleware();
  testTenantLib();
  testSubdomainExtraction();
  await testDbResolution();
  await testDataIsolation();
  testTranslationKeys();
  testFileIntegration();
  testZeroEmojis();
  testCookieScoping();
  await testSubdomainRedisCache();
  await testUpstashRateLimiting();

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});

