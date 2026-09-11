import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('🚀 Checking / Running Phase 9 Business Branding Migration...\n');

  const sqlFilePath = path.join(process.cwd(), 'supabase/migrations/20260906000017_phase9_business_branding.sql');
  const sql = fs.readFileSync(sqlFilePath, 'utf8');

  // Try direct endpoints first if available
  const endpoints = [`${SUPABASE_URL}/pg`, `${SUPABASE_URL}/sql`];
  let executedDirectly = false;

  for (const ep of endpoints) {
    try {
      const resp = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (resp.ok) {
        console.log(`✅ Migration applied directly via ${ep}`);
        executedDirectly = true;
        break;
      }
    } catch {}
  }

  // Verify status in DB
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('business_branding')
    .select('id, business_id, display_name, primary_color, accent_color, font_family, layout_variant')
    .limit(5);

  if (!error) {
    console.log('✅ business_branding table exists and is accessible!');
    console.log(`Found ${data?.length || 0} branding records.`);
  } else {
    console.log('⚠️ business_branding table not ready yet:', error.message);
    if (!executedDirectly) {
      console.log('\nPlease run the SQL in Supabase dashboard:');
      console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new\n');
      console.log('--- SQL Content ---');
      console.log(sql);
      console.log('-------------------');
    }
  }
}

main().catch(console.error);
