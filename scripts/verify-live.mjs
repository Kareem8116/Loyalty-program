import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const base = 'https://loyalty-app-chi-seven.vercel.app';

async function runLiveAudit() {
  console.log('--- 1. Testing Production HTTP Endpoints ---');
  const urls = [
    { path: '/', expected: [200, 307, 308] },
    { path: '/login', expected: [200] },
    { path: '/card', expected: [200] },
    { path: '/card/QGSBREA6Q', expected: [200] },
    { path: '/api/customer/QGSBREA6Q', expected: [200] },
    { path: '/api/cron/queue-status', expected: [200] },
    { path: '/api/health', expected: [200, 404] },
    { path: '/api/offers?businessId=806d00f6-0624-446c-af1d-2a7c76a9743e', expected: [200] }
  ];

  for (const item of urls) {
    try {
      const res = await fetch(`${base}${item.path}`, { redirect: 'manual' });
      const pass = item.expected.includes(res.status);
      console.log(`${pass ? '✅' : '❌'} ${item.path.padEnd(45)} Status: ${res.status}`);
      if (!pass) {
        const text = await res.text();
        console.log(`   Response: ${text.slice(0, 150)}`);
      }
    } catch (err) {
      console.log(`❌ ${item.path.padEnd(45)} Error: ${err.message}`);
    }
  }

  console.log('\n--- 2. Supabase Database & Security Verification ---');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Check businesses
  const { data: businesses, error: bizErr } = await supabase.from('businesses').select('id, name, subdomain').limit(5);
  console.log(`Businesses query: ${bizErr ? '❌ ' + bizErr.message : '✅ Found ' + businesses.length + ' businesses'}`);

  // Check customers
  const { data: customers, error: custErr } = await supabase.from('customers').select('id, phone_number, name').limit(5);
  console.log(`Customers query: ${custErr ? '❌ ' + custErr.message : '✅ Found ' + customers.length + ' customers'}`);

  // Check points_ledger
  const { count: ledgerCount, error: ledgErr } = await supabase.from('points_ledger').select('*', { count: 'exact', head: true });
  console.log(`Ledger records: ${ledgErr ? '❌ ' + ledgErr.message : '✅ Total rows: ' + ledgerCount}`);

  // Check partitions / ledger structure
  const { data: branches, error: brErr } = await supabase.from('branches').select('id, name, business_id').limit(5);
  console.log(`Branches query: ${brErr ? '❌ ' + brErr.message : '✅ Found ' + branches.length + ' branches'}`);

  // Check membership_tiers
  const { data: tiers, error: tierErr } = await supabase.from('membership_tiers').select('id, name, min_points_earned').limit(5);
  console.log(`Tiers query: ${tierErr ? '❌ ' + tierErr.message : '✅ Found ' + tiers.length + ' tiers'}`);

  // Check redemption_rates
  const { data: rates, error: rateErr } = await supabase.from('redemption_rates').select('*').limit(5);
  console.log(`Redemption rates: ${rateErr ? '❌ ' + rateErr.message : '✅ Found ' + rates.length + ' rate configs'}`);
}

runLiveAudit();
