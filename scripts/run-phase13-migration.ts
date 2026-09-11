import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('\n=== Phase 13 Migration Check ===\n');

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Check if consent_given_at column already exists
  const { data, error } = await adminClient
    .from('customers')
    .select('id, consent_given_at')
    .limit(1);

  if (!error) {
    console.log('✅ consent_given_at column is present in customers table!');
    return;
  }

  console.log('⚠️ consent_given_at column not detected or error:', error.message);
  console.log('\nPlease run the following SQL in the Supabase SQL Editor:');
  console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new\n');
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260903000008_phase13_consent.sql'), 'utf-8');
  console.log(sql);
}

main().catch(console.error);
