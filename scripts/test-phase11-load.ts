import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { recordPointsTransaction } from '../lib/cashier';
import { redis } from '../lib/redis';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('\n=== Phase 11: Async Queue Load Test ===\n');

  // 1. Setup mock data
  const businessId = 'test-business-id-123';
  const customerId = 'test-customer-id-123';
  
  // Actually, we need real UUIDs if foreign keys are enforced, but wait, the API uses the service_role
  // We can just query an existing business and customer
  const { data: business } = await adminClient.from('businesses').select('id').limit(1).single();
  
  if (!business) {
    console.log('❌ No business found in DB to test with. Run Phase 1-10 tests first.');
    return;
  }
  
  let { data: customer } = await adminClient.from('customers').select('id').eq('business_id', business.id).limit(1).maybeSingle();
  
  if (!customer) {
    // create a dummy customer
    const { data: newCust, error } = await adminClient.from('customers').insert({
      business_id: business.id,
      name: 'Load Test Customer',
      phone_number: '0000000000',
    }).select('id').single();
    if (error) throw error;
    customer = newCust;
  }
  
  const bId = business.id;
  const cId = customer.id;

  // Clear queue
  await redis.del('points_queue');
  console.log('✅ Cleared points_queue in Redis');

  // 2. Fire 100 concurrent requests to queue points
  const numRequests = 100;
  console.log(`\nFiring ${numRequests} concurrent points additions...`);
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < numRequests; i++) {
    promises.push(
      recordPointsTransaction({
        businessId: bId,
        customerId: cId,
        pointsChange: 5,
        reason: 'load-test-' + i,
        client: adminClient,
        asyncQueue: true,
      })
    );
  }
  
  await Promise.all(promises);
  const endTime = Date.now();
  
  console.log(`✅ Queued ${numRequests} requests in ${endTime - startTime}ms`);
  
  // 3. Check queue size
  const queueLength = await redis.llen('points_queue');
  console.log(`\nQueue size is now: ${queueLength}`);
  if (queueLength !== numRequests) {
    console.log(`❌ Expected queue size ${numRequests}, got ${queueLength}`);
  }

  // 4. Trigger the cron endpoint simulation
  console.log(`\nProcessing queue...`);
  const processStart = Date.now();
  
  const items = [];
  for (let i = 0; i < queueLength; i++) {
    const item = await redis.rpop('points_queue');
    if (!item) break;
    const parsed = typeof item === 'string' ? JSON.parse(item) : item;
    if (parsed.queued_at) delete parsed.queued_at;
    items.push(parsed);
  }
  
  if (items.length > 0) {
    const { error } = await adminClient.from('points_ledger').insert(items);
    if (error) {
      console.log('❌ Failed to bulk insert points_ledger:', error);
    } else {
      console.log(`✅ Bulk inserted ${items.length} records in ${Date.now() - processStart}ms`);
    }
  }

  // Verify DB count
  const { count } = await adminClient
    .from('points_ledger')
    .select('*', { count: 'exact', head: true })
    .like('reason', 'load-test-%');
    
  console.log(`\n✅ DB has ${count} load-test ledger entries.`);

  // Cleanup
  await adminClient.from('points_ledger').delete().like('reason', 'load-test-%');
  console.log('🧹 Cleaned up test data');
}

main().catch(console.error);
