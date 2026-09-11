import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generate9CharToken(): string {
  const bytes = randomBytes(9);
  let token = '';
  for (let i = 0; i < 9; i++) {
    token += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return token;
}

async function migrateTokens() {
  console.log('🔄 Checking customer qr_tokens in database...');

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, qr_token');

  if (error) {
    console.error('Error fetching customers:', error);
    process.exit(1);
  }

  let updatedCount = 0;
  for (const c of customers) {
    // If not 9 chars, generate a clean 9-char code
    if (!c.qr_token || c.qr_token.length !== 9 || !/^[0-9A-Za-z]{9}$/.test(c.qr_token)) {
      let newToken = generate9CharToken();
      
      // Ensure uniqueness
      let isUnique = false;
      while (!isUnique) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('qr_token', newToken)
          .maybeSingle();
        if (!existing) {
          isUnique = true;
        } else {
          newToken = generate9CharToken();
        }
      }

      console.log(`Updating customer [${c.id}] ${c.name}: "${c.qr_token}" -> "${newToken}" (9 chars)`);
      const { error: updateErr } = await supabase
        .from('customers')
        .update({ qr_token: newToken })
        .eq('id', c.id);

      if (updateErr) {
        console.error(`Failed to update customer ${c.id}:`, updateErr);
      } else {
        updatedCount++;
      }
    } else {
      console.log(`Customer [${c.id}] ${c.name} already has valid 9-char token: "${c.qr_token}"`);
    }
  }

  console.log(`\n✅ Migration complete: ${updatedCount} customer tokens updated to 9 alphanumeric characters!`);
}

migrateTokens().catch(console.error);
