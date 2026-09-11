import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('\n=== Phase 14 Migration Check ===\n');

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Check redemption_rates.points_expiry_months
  const { error: err1 } = await adminClient
    .from('redemption_rates')
    .select('id, points_expiry_months')
    .limit(1);

  // Check points_ledger.expires_at
  const { error: err2 } = await adminClient
    .from('points_ledger')
    .select('id, expires_at')
    .limit(1);

  if (!err1 && !err2) {
    console.log('✅ Phase 14 columns already present in Supabase!');
    return;
  }

  console.log('⚠️ Phase 14 columns not detected yet:');
  if (err1) console.log(' - redemption_rates:', err1.message);
  if (err2) console.log(' - points_ledger:', err2.message);
  
  console.log('\nPlease run the following SQL in the Supabase SQL Editor:');
  console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new\n');
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260903000009_phase14_points_expiry.sql'), 'utf-8');
  console.log(sql);
}

main().catch(console.error);
