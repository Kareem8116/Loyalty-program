import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('🚀 Checking / Running Phase 24 AI Recommendations Migration...\n');

  const sqlFilePath = path.join(process.cwd(), 'supabase/migrations/20260905000014_phase24_ai_recommendations.sql');
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

  // 1. Check feature_definitions for ai_recommendations
  const { data: featData, error: featErr } = await supabase
    .from('feature_definitions')
    .select('key, name')
    .eq('key', 'ai_recommendations')
    .maybeSingle();

  // If not there, let's insert it directly via Service Role
  if (!featData) {
    const { error: insertFeatErr } = await supabase
      .from('feature_definitions')
      .upsert({
        key: 'ai_recommendations',
        name: 'توصيات ذكية بـ Gemini',
        description: 'توليد رسالة تشجيعية وتوصية مكافأة ذكية للعميل عبر الذكاء الاصطناعي بناء على رصيده ومكافآته المتاحة',
      });
    if (insertFeatErr) {
      console.log('⚠️ Could not insert into feature_definitions:', insertFeatErr.message);
    } else {
      console.log('✅ ai_recommendations registered in feature_definitions.');
    }
  } else {
    console.log('✅ ai_recommendations is already in feature_definitions.');
  }

  // 2. Check business_ai_settings table
  const { error: settingsErr } = await supabase
    .from('business_ai_settings')
    .select('id')
    .limit(1);

  if (settingsErr && settingsErr.code === '42P01') {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('⚠️  SQL ACTION REQUIRED IN SUPABASE DASHBOARD:');
    console.log('The table business_ai_settings does not exist yet.');
    console.log('Please copy and run the contents of:');
    console.log('supabase/migrations/20260905000014_phase24_ai_recommendations.sql');
    console.log('in your Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('══════════════════════════════════════════════════════════════\n');
    process.exit(1);
  } else if (settingsErr) {
    console.log('⚠️ Note checking business_ai_settings:', settingsErr.message);
  } else {
    console.log('✅ Table business_ai_settings exists and is ready.');
    console.log('\n🎉 Phase 24 Database migration successfully verified!');
  }
}

main().catch((err) => {
  console.error('Error running migration check:', err);
  process.exit(1);
});
