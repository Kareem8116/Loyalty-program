import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('Adding redemption_type column to redemption_rates...');
  
  // Check current state first
  const { error: checkErr } = await sb
    .from('redemption_rates')
    .select('redemption_type')
    .limit(1);
  
  if (!checkErr) {
    console.log('Column already exists - skipping ALTER TABLE');
    process.exit(0);
  }
  
  // The column is missing. Apply migration via Supabase SQL editor isn't available 
  // through SDK directly (no exec_sql RPC by default). We need to set up the column.
  // We'll use the approach: update the migration file and log instructions for the user.
  console.log('Column is missing. Running migration SQL...');
  
  // Try using supabase management api
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = url.replace('https://', '').split('.')[0];
  
  const migrationSql = `ALTER TABLE public.redemption_rates ADD COLUMN IF NOT EXISTS redemption_type TEXT NOT NULL DEFAULT 'both' CHECK (redemption_type IN ('product', 'cash', 'both'));`;
  
  console.log('\nSQL to run in Supabase Dashboard → SQL Editor:');
  console.log('---');
  console.log(migrationSql);
  console.log('---');
  console.log('\nProjectRef:', projectRef);
  
  // Try Supabase Management API
  const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: migrationSql }),
  });
  
  const result = await resp.json();
  console.log('Management API response:', resp.status, JSON.stringify(result));
}

run().catch(console.error);
