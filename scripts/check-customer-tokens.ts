import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkCustomerTokens() {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, phone_number, qr_token');

  if (error) {
    console.error('Error fetching customers:', error);
    return;
  }

  console.log(`Found ${customers.length} customers:`);
  for (const c of customers) {
    console.log(`- [${c.id}] ${c.name} (${c.phone_number}): qr_token = "${c.qr_token}" (length ${c.qr_token?.length})`);
  }
}

checkCustomerTokens();
