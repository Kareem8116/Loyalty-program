/**
 * Run Phase 10 migration via Supabase PostgREST SQL execution
 * Uses the service_role key to directly create tables
 */
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function execSql(sql: string): Promise<{ success: boolean; error?: string }> {
  // Use the Supabase pg_query endpoint (available in all Supabase projects)
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
    return { success: true };
  }

  // Try the /rest/v1/rpc approach - create a temp function
  const resp2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({}),
  });

  return { success: false, error: `HTTP ${resp.status}: ${await resp.text()}` };
}

async function main() {
  console.log('\n=== Phase 10 Migration via Direct SQL ===\n');

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  // Check if tables already exist
  const { error: pErr } = await adminClient.from('partnerships').select('id').limit(0);
  if (!pErr) {
    console.log('✅ partnerships table already exists');
    const { error: tErr } = await adminClient.from('partnership_transfers').select('id').limit(0);
    if (!tErr) {
      console.log('✅ partnership_transfers table already exists');
      console.log('\n✅ Both tables exist. Migration already applied!\n');
      return;
    }
  }

  // Tables don't exist. Let's try to use the Supabase SQL API
  // Using the newer /sql endpoint
  const sqlStatements = [
    // 1. Create partnerships table
    `CREATE TABLE IF NOT EXISTS public.partnerships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id_a UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
      business_id_b UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
      terms TEXT,
      initiated_by UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_ordered_business_ids CHECK (business_id_a < business_id_b),
      CONSTRAINT uq_partnership_pair UNIQUE (business_id_a, business_id_b),
      CONSTRAINT chk_no_self_partnership CHECK (business_id_a <> business_id_b)
    )`,
    // 2. Updated_at trigger
    `DROP TRIGGER IF EXISTS tr_partnerships_updated_at ON public.partnerships`,
    `CREATE TRIGGER tr_partnerships_updated_at BEFORE UPDATE ON public.partnerships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`,
    // 3. Indexes
    `CREATE INDEX IF NOT EXISTS idx_partnerships_business_a ON public.partnerships(business_id_a)`,
    `CREATE INDEX IF NOT EXISTS idx_partnerships_business_b ON public.partnerships(business_id_b)`,
    `CREATE INDEX IF NOT EXISTS idx_partnerships_status ON public.partnerships(status)`,
    // 4. Create partnership_transfers table
    `CREATE TABLE IF NOT EXISTS public.partnership_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partnership_id UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
      from_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
      to_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
      points_transferred INTEGER NOT NULL CHECK (points_transferred > 0),
      reason TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // 5. Indexes for transfers
    `CREATE INDEX IF NOT EXISTS idx_ptransfers_partnership ON public.partnership_transfers(partnership_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ptransfers_customer ON public.partnership_transfers(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ptransfers_from_biz ON public.partnership_transfers(from_business_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ptransfers_to_biz ON public.partnership_transfers(to_business_id)`,
    // 6. RLS for partnerships
    `ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY`,
    `CREATE POLICY partnerships_super_admin_all ON public.partnerships FOR ALL USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin')`,
    `CREATE POLICY partnerships_owner_select ON public.partnerships FOR SELECT USING (public.get_user_role() IN ('owner', 'branch_admin') AND (business_id_a = public.get_user_business_id() OR business_id_b = public.get_user_business_id()))`,
    `CREATE POLICY partnerships_owner_insert ON public.partnerships FOR INSERT WITH CHECK (public.get_user_role() = 'owner' AND (business_id_a = public.get_user_business_id() OR business_id_b = public.get_user_business_id()))`,
    `CREATE POLICY partnerships_owner_update ON public.partnerships FOR UPDATE USING (public.get_user_role() = 'owner' AND (business_id_a = public.get_user_business_id() OR business_id_b = public.get_user_business_id())) WITH CHECK (public.get_user_role() = 'owner' AND (business_id_a = public.get_user_business_id() OR business_id_b = public.get_user_business_id()))`,
    // 7. RLS for partnership_transfers
    `ALTER TABLE public.partnership_transfers ENABLE ROW LEVEL SECURITY`,
    `CREATE POLICY ptransfers_super_admin_all ON public.partnership_transfers FOR ALL USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin')`,
    `CREATE POLICY ptransfers_owner_select ON public.partnership_transfers FOR SELECT USING (public.get_user_role() IN ('owner', 'branch_admin') AND (from_business_id = public.get_user_business_id() OR to_business_id = public.get_user_business_id()))`,
    `CREATE POLICY ptransfers_owner_insert ON public.partnership_transfers FOR INSERT WITH CHECK (public.get_user_role() = 'owner' AND from_business_id = public.get_user_business_id())`,
  ];

  // Try each endpoint approach
  const endpoints = [
    { url: `${SUPABASE_URL}/pg`, label: '/pg' },
    { url: `${SUPABASE_URL}/sql`, label: '/sql' },
  ];

  let workingEndpoint: string | null = null;

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
    for (let i = 0; i < sqlStatements.length; i++) {
      const stmt = sqlStatements[i];
      try {
        const resp = await fetch(workingEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: stmt }),
        });
        const ok = resp.ok;
        console.log(`  ${ok ? '✅' : '❌'} ${i + 1}/${sqlStatements.length}: ${stmt.substring(0, 60)}...`);
        if (!ok) {
          console.log(`     Error: ${await resp.text()}`);
        }
      } catch (e: any) {
        console.log(`  ❌ ${i + 1}: ${e.message}`);
      }
    }
  } else {
    console.log('\n❌ No SQL endpoint available. Please run the migration manually.');
    console.log('\nGo to: https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('And paste the contents of: supabase/migrations/20260903000006_phase10_partnerships.sql\n');
    return;
  }

  // Verify
  console.log('\n--- Verification ---');
  const { error: pErr2 } = await adminClient.from('partnerships').select('id').limit(0);
  console.log(`  partnerships: ${!pErr2 ? '✅' : '❌ ' + pErr2.message}`);
  const { error: tErr2 } = await adminClient.from('partnership_transfers').select('id').limit(0);
  console.log(`  partnership_transfers: ${!tErr2 ? '✅' : '❌ ' + tErr2.message}`);
  console.log('\nDone!\n');
}

main().catch(console.error);
