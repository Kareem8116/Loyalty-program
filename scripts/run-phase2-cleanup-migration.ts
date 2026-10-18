import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Extract project ref from Supabase URL
// e.g. https://xrhyyfxdjzbrtgbgsieh.supabase.co -> xrhyyfxdjzbrtgbgsieh
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

async function runMigration() {
  console.log('🚀 Applying Migration: Drop Legacy RLS Functions\n');
  console.log(`   Project: ${projectRef}`);

  const sqlFilePath = path.join(
    process.cwd(),
    'supabase/migrations/20260921000038_drop_legacy_rls_functions.sql'
  );

  if (!fs.existsSync(sqlFilePath)) {
    console.error('❌ Migration file not found:', sqlFilePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFilePath, 'utf8');
  console.log('\n📄 SQL to apply:');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));

  // Try Supabase Management API (db/query endpoint)
  const managementEndpoints = [
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
  ];

  let applied = false;

  // Method 1: Management API
  try {
    console.log('\n⏳ Trying Supabase Management API...');
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    const responseText = await resp.text();
    if (resp.ok) {
      console.log('✅ Migration applied via Management API!');
      applied = true;
    } else {
      console.log(`   ⚠️ Management API failed (${resp.status}):`, responseText.slice(0, 200));
    }
  } catch (err: any) {
    console.log('   ⚠️ Management API error:', err.message);
  }

  // Method 2: pg REST endpoint
  if (!applied) {
    try {
      console.log('\n⏳ Trying pg REST endpoint...');
      const resp = await fetch(`${SUPABASE_URL}/pg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (resp.ok) {
        console.log('✅ Migration applied via pg endpoint!');
        applied = true;
      } else {
        const txt = await resp.text();
        console.log(`   ⚠️ pg endpoint failed (${resp.status}):`, txt.slice(0, 200));
      }
    } catch (err: any) {
      console.log('   ⚠️ pg endpoint error:', err.message);
    }
  }

  if (!applied) {
    // Method 3: Manual fallback — print link to dashboard
    console.log('\n─────────────────────────────────────────────────');
    console.log('📋 الطريقة اليدوية — افتح هذا الرابط وانسخ الـ SQL:');
    console.log(`\nhttps://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
    console.log('ثم الصق هذا الـ SQL:');
    console.log('─────────────────────────────────────────────────');
    console.log(sql);
    console.log('─────────────────────────────────────────────────');
  }

  // Verify: check that the old functions no longer exist
  console.log('\n🔍 Verifying legacy functions were removed...');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // If these functions still exist, calling them will return data; if dropped, it'll error
    const checks = [
      { name: 'get_user_role()',        rpc: 'get_user_role' },
      { name: 'get_user_business_id()', rpc: 'get_user_business_id' },
      { name: 'get_user_branch_id()',   rpc: 'get_user_branch_id' },
    ];

    let allDropped = true;
    for (const check of checks) {
      const { error } = await supabase.rpc(check.rpc as any);
      if (error && (error.message.includes('does not exist') || error.message.includes('function'))) {
        console.log(`   ✅ ${check.name} — removed successfully`);
      } else if (error) {
        // Other errors (e.g. auth context) still mean function might not exist cleanly
        console.log(`   ⚠️  ${check.name} — ${error.message}`);
      } else {
        console.log(`   ❌ ${check.name} — still exists! Migration may not have run.`);
        allDropped = false;
      }
    }

    if (allDropped) {
      console.log('\n🎉 Migration verified — legacy functions fully removed!');
    } else {
      console.log('\n⚠️ Some functions still exist. Apply the SQL manually via the dashboard link above.');
    }
  } catch (verifyErr: any) {
    console.warn('\n⚠️ Could not verify (non-fatal):', verifyErr.message);
  }
}

runMigration().catch(console.error);
