import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('\n=== Phase 11 Migration via Direct SQL ===\n');

  const sqlFilePath = path.join(process.cwd(), 'supabase/migrations/20260903000007_phase11_partitioning.sql');
  const sql = fs.readFileSync(sqlFilePath, 'utf8');

  let workingEndpoint: string | null = null;
  const endpoints = [
    { url: `${SUPABASE_URL}/pg`, label: '/pg' },
    { url: `${SUPABASE_URL}/sql`, label: '/sql' },
  ];

  for (const ep of endpoints) {
    try {
      const testResp = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: 'SELECT 1' }),
      });
      if (testResp.ok || testResp.status === 200) {
        workingEndpoint = ep.url;
        console.log(`✅ Found working SQL endpoint: ${ep.label}`);
        break;
      }
    } catch {}
  }

  if (workingEndpoint) {
    console.log('Running the complete migration script...');
    try {
      const resp = await fetch(workingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      const ok = resp.ok;
      if (ok) {
        console.log('✅ Migration executed successfully!');
      } else {
        console.log(`❌ Migration Failed: ${await resp.text()}`);
      }
    } catch (e: any) {
      console.log(`❌ Migration Failed: ${e.message}`);
    }
  } else {
    console.log('\n❌ No SQL endpoint available. Please run the migration manually.');
    console.log('\nGo to: https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('And paste the contents of: supabase/migrations/20260903000007_phase11_partitioning.sql\n');
  }
}

main().catch(console.error);
