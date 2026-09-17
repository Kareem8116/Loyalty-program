import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('=== Checking Partition RLS Fix ===\n');

  const sqlFilePath = path.join(process.cwd(), 'supabase/migrations/20260918000036_fix_partition_rls_and_cleanup.sql');
  const sql = fs.readFileSync(sqlFilePath, 'utf8');

  // Attempt to execute via Supabase SQL endpoint if available
  const endpoints = [
    { url: `${SUPABASE_URL}/pg`, label: '/pg' },
    { url: `${SUPABASE_URL}/sql`, label: '/sql' },
  ];

  let executed = false;
  for (const ep of endpoints) {
    try {
      const resp = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (resp.ok) {
        console.log(`✅ Successfully executed migration via ${ep.label}!`);
        executed = true;
        break;
      }
    } catch {}
  }

  if (!executed) {
    console.log('ℹ️ Direct REST SQL execution is disabled on this Supabase project (standard security configuration).');
    console.log('\n=============================================================');
    console.log('Please copy and execute the SQL migration in the Supabase Dashboard:');
    console.log('URL: https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('=============================================================\n');
  }
}

main().catch(console.error);
