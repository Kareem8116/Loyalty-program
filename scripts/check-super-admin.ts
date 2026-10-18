import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const SA_ID = '514dcb7b-a687-48b2-ab92-8eb75a1fa31f';
  
  const { data: { user }, error } = await supabase.auth.admin.getUserById(SA_ID);
  if (error || !user) { console.error('Error:', error); return; }

  console.log('\n=== SUPER ADMIN ACCOUNT DETAILS ===');
  console.log(`Email:             ${user.email}`);
  console.log(`Email Confirmed:   ${user.email_confirmed_at ? '✅ YES (' + new Date(user.email_confirmed_at).toLocaleString() + ')' : '❌ NO'}`);
  console.log(`Created At:        ${new Date(user.created_at).toLocaleString()}`);
  console.log(`Last Sign In:      ${user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}`);
  console.log(`Phone:             ${user.phone || 'None'}`);
  console.log(`email_verified:    ${user.user_metadata?.email_verified}`);
  console.log(`Identities:        ${user.identities?.map(i => i.provider).join(', ')}`);
  console.log('===================================\n');
}

main().catch(console.error);
