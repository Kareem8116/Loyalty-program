/**
 * Phase 11.5 — Load Test
 *
 * Simple load test for the Loyalty App API endpoints.
 * Tests: customer card fetch, points earn, offers list, and menu items.
 *
 * Usage:
 *   node --env-file=.env.local scripts/load-test.mjs [options]
 *
 * Options:
 *   --url=<base>        Base URL (default: http://localhost:3000)
 *   --concurrency=<n>   Concurrent workers (default: 10)
 *   --duration=<s>      Test duration in seconds (default: 30)
 *   --subdomain=<name>  Business subdomain to test against (default: democoffee)
 */

const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || '10');
const DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || '30');
const SUBDOMAIN = process.env.LOAD_TEST_SUBDOMAIN || 'democoffee';

// ─── Results Storage ──────────────────────────────────────────────────────────
const results = {
  total: 0,
  success: 0,
  failed: 0,
  latencies: [],
  errors: {},
  byEndpoint: {},
};

// ─── Endpoints to Test ────────────────────────────────────────────────────────
// We test public/low-auth endpoints — these are the highest traffic paths
const ENDPOINTS = [
  {
    name: 'GET /api/customer/card',
    method: 'GET',
    path: '/api/customer/card?token=test-token-123',
    weight: 40, // 40% of requests (most popular)
  },
  {
    name: 'GET /api/offers',
    method: 'GET',
    path: '/api/offers?type=special',
    weight: 25,
  },
  {
    name: 'GET /api/cashier/menu',
    method: 'GET',
    path: '/api/cashier/menu',
    weight: 20,
  },
  {
    name: 'GET /api/tenant',
    method: 'GET',
    path: '/api/tenant',
    weight: 15,
  },
];

// ─── Weighted Endpoint Selector ───────────────────────────────────────────────
function selectEndpoint() {
  const totalWeight = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const ep of ENDPOINTS) {
    rand -= ep.weight;
    if (rand <= 0) return ep;
  }
  return ENDPOINTS[0];
}

// ─── Single Request ───────────────────────────────────────────────────────────
async function makeRequest(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: {
        'x-subdomain': SUBDOMAIN,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout per request
    });

    const latency = performance.now() - start;
    const status = response.status;

    return {
      ok: status < 500,
      status,
      latency,
      endpoint: endpoint.name,
    };
  } catch (err) {
    const latency = performance.now() - start;
    return {
      ok: false,
      status: 0,
      latency,
      endpoint: endpoint.name,
      error: err.message,
    };
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────
async function worker(stopSignal) {
  while (!stopSignal.stop) {
    const endpoint = selectEndpoint();
    const result = await makeRequest(endpoint);

    results.total++;
    results.latencies.push(result.latency);

    if (!results.byEndpoint[result.endpoint]) {
      results.byEndpoint[result.endpoint] = { total: 0, success: 0, failed: 0, latencies: [] };
    }
    results.byEndpoint[result.endpoint].total++;
    results.byEndpoint[result.endpoint].latencies.push(result.latency);

    if (result.ok) {
      results.success++;
      results.byEndpoint[result.endpoint].success++;
    } else {
      results.failed++;
      results.byEndpoint[result.endpoint].failed++;
      const errKey = result.error || `HTTP ${result.status}`;
      results.errors[errKey] = (results.errors[errKey] || 0) + 1;
    }
  }
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Progress Reporter ────────────────────────────────────────────────────────
function reportProgress(elapsed) {
  const rps = results.total / elapsed;
  const successRate = results.total > 0 ? (results.success / results.total) * 100 : 0;
  const p95 = percentile(results.latencies, 95);

  process.stdout.write(
    `\r⏱  ${elapsed.toFixed(0)}s | ${rps.toFixed(1)} req/s | ✅ ${successRate.toFixed(1)}% | p95: ${p95.toFixed(0)}ms | total: ${results.total}`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Phase 11.5 — Loyalty App Load Test               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Base URL:     ${BASE_URL}`);
  console.log(`  Subdomain:    ${SUBDOMAIN}`);
  console.log(`  Concurrency:  ${CONCURRENCY} workers`);
  console.log(`  Duration:     ${DURATION_SECONDS}s`);
  console.log(`  Endpoints:    ${ENDPOINTS.length}`);
  console.log('');

  // Connectivity check
  console.log('  Checking connectivity...');
  try {
    const res = await fetch(`${BASE_URL}/api/tenant`, {
      headers: { 'x-subdomain': SUBDOMAIN },
      signal: AbortSignal.timeout(5000),
    });
    console.log(`  ✅ Server responding (HTTP ${res.status})\n`);
  } catch (err) {
    console.error(`  ❌ Cannot reach server: ${err.message}`);
    console.error('  Make sure the app is running with: npm run dev');
    process.exit(1);
  }

  console.log('  Starting load test...\n');

  const stopSignal = { stop: false };
  const workerPromises = Array.from({ length: CONCURRENCY }, () => worker(stopSignal));

  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    reportProgress(elapsed);
  }, 500);

  // Run for DURATION_SECONDS
  await new Promise(resolve => setTimeout(resolve, DURATION_SECONDS * 1000));

  stopSignal.stop = true;
  clearInterval(progressInterval);

  // Wait for workers to finish current request
  await Promise.allSettled(workerPromises);

  const totalElapsed = (Date.now() - startTime) / 1000;
  process.stdout.write('\n\n');

  // ─── Final Report ─────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║                   RESULTS SUMMARY                    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const rps = results.total / totalElapsed;
  const successRate = results.total > 0 ? (results.success / results.total) * 100 : 0;

  console.log(`  Duration:       ${totalElapsed.toFixed(2)}s`);
  console.log(`  Total requests: ${results.total}`);
  console.log(`  Successful:     ${results.success} (${successRate.toFixed(2)}%)`);
  console.log(`  Failed:         ${results.failed}`);
  console.log(`  Throughput:     ${rps.toFixed(2)} req/s`);
  console.log('');
  console.log('  Latency percentiles:');
  console.log(`    p50:  ${percentile(results.latencies, 50).toFixed(1)}ms`);
  console.log(`    p75:  ${percentile(results.latencies, 75).toFixed(1)}ms`);
  console.log(`    p90:  ${percentile(results.latencies, 90).toFixed(1)}ms`);
  console.log(`    p95:  ${percentile(results.latencies, 95).toFixed(1)}ms`);
  console.log(`    p99:  ${percentile(results.latencies, 99).toFixed(1)}ms`);
  console.log(`    max:  ${Math.max(...results.latencies).toFixed(1)}ms`);
  console.log(`    avg:  ${avg(results.latencies).toFixed(1)}ms`);
  console.log('');

  console.log('  By Endpoint:');
  for (const [epName, epStats] of Object.entries(results.byEndpoint)) {
    const epSuccessRate = epStats.total > 0 ? ((epStats.success / epStats.total) * 100).toFixed(1) : '0.0';
    const epP95 = percentile(epStats.latencies, 95).toFixed(0);
    console.log(`    ${epName}`);
    console.log(`      Requests: ${epStats.total} | Success: ${epSuccessRate}% | p95: ${epP95}ms`);
  }

  if (Object.keys(results.errors).length > 0) {
    console.log('');
    console.log('  Errors breakdown:');
    for (const [errKey, count] of Object.entries(results.errors)) {
      console.log(`    ${errKey}: ${count}x`);
    }
  }

  console.log('');

  // ─── Pass/Fail Criteria ───────────────────────────────────────────────────
  console.log('  Performance Targets:');
  const p95 = percentile(results.latencies, 95);
  const p99 = percentile(results.latencies, 99);

  const targets = [
    { name: 'Success rate ≥ 99%', pass: successRate >= 99 },
    { name: 'p95 latency < 500ms', pass: p95 < 500 },
    { name: 'p99 latency < 1000ms', pass: p99 < 1000 },
    { name: 'Throughput > 5 req/s', pass: rps > 5 },
  ];

  let allPassed = true;
  for (const target of targets) {
    const icon = target.pass ? '✅' : '❌';
    console.log(`    ${icon} ${target.name}`);
    if (!target.pass) allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log('  🎉 ALL TARGETS PASSED — Phase 11.5 Complete!\n');
  } else {
    console.log('  ⚠️  Some targets missed — review Redis caching and DB indexes.\n');
  }
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
