import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TEST_EMAIL = 'customer@pointat.net';
const TEST_PASSWORD = 'Customer123!';
const TEST_PIN = '1234';

async function main() {
  console.log('=== Setting up Customer Demo Account ===');

  // 1. Check or create Auth User
  let authUserId: string | null = null;
  const { data: usersData, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error('Error listing users:', listErr.message);
  }

  const existing = usersData?.users?.find(u => u.email === TEST_EMAIL);
  if (existing) {
    console.log('Auth user already exists:', existing.email, existing.id);
    authUserId = existing.id;
    // Update password to ensure it matches TEST_PASSWORD
    await admin.auth.admin.updateUserById(authUserId, {
      password: TEST_PASSWORD,
      email_confirm: true,
    });
  } else {
    console.log('Creating auth user:', TEST_EMAIL);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      console.error('Failed to create auth user:', createErr);
      process.exit(1);
    }
    authUserId = created.user.id;
    console.log('Auth user created successfully:', authUserId);
  }

  // 2. Check businesses
  const { data: businesses } = await admin.from('businesses').select('id, name, subdomain').limit(2);
  if (!businesses || businesses.length === 0) {
    console.error('No businesses found!');
    process.exit(1);
  }
  console.log('Found businesses:', businesses.map(b => `${b.name} (${b.id})`));

  const biz = businesses[0];

  // 3. Check or create Customer in that business
  let { data: customer } = await admin
    .from('customers')
    .select('id, name, phone_number, qr_token')
    .eq('business_id', biz.id)
    .limit(1)
    .maybeSingle();

  if (!customer) {
    const { data: newCust, error: custErr } = await admin
      .from('customers')
      .insert({
        business_id: biz.id,
        name: 'كريم يونس',
        phone_number: '+201012345678',
      })
      .select()
      .single();
    if (custErr || !newCust) {
      console.error('Failed to create customer:', custErr);
      process.exit(1);
    }
    customer = newCust;
    console.log('Created customer:', customer.name);

    // Give some points
    await admin.from('points_ledger').insert([
      { business_id: biz.id, customer_id: customer.id, points_change: 250, reason: 'welcome_points' }
    ]);
  } else {
    console.log('Found existing customer:', customer.name, customer.id);
  }

  // 4. Create or update customer_auth_links
  // Hash the PIN using sha256
  const pinHash = crypto.createHash('sha256').update(TEST_PIN).digest('hex');

  const { data: existingLink } = await admin
    .from('customer_auth_links')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('customer_id', customer.id)
    .maybeSingle();

  if (existingLink) {
    console.log('Updating existing link with PIN...');
    await admin
      .from('customer_auth_links')
      .update({
        access_pin_hash: pinHash,
        failed_pin_attempts: 0,
        locked_until: null,
      })
      .eq('id', existingLink.id);
  } else {
    console.log('Inserting new customer_auth_link...');
    const { error: linkErr } = await admin
      .from('customer_auth_links')
      .insert({
        auth_user_id: authUserId,
        customer_id: customer.id,
        access_pin_hash: pinHash,
        failed_pin_attempts: 0,
      });
    if (linkErr) {
      console.error('Failed to link customer to auth user:', linkErr);
      process.exit(1);
    }
  }

  // Also check if second business exists, create a second place without PIN so user can test "Set PIN"
  if (businesses.length > 1) {
    const biz2 = businesses[1];
    let { data: cust2 } = await admin
      .from('customers')
      .select('id, name')
      .eq('business_id', biz2.id)
      .limit(1)
      .maybeSingle();

    if (!cust2) {
      const { data: newCust2 } = await admin
        .from('customers')
        .insert({
          business_id: biz2.id,
          name: 'كريم يونس',
          phone_number: '+201012345678',
        })
        .select()
        .single();
      cust2 = newCust2;
    }

    if (cust2) {
      const { data: link2 } = await admin
        .from('customer_auth_links')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('customer_id', cust2.id)
        .maybeSingle();

      if (!link2) {
        await admin.from('customer_auth_links').insert({
          auth_user_id: authUserId,
          customer_id: cust2.id,
          access_pin_hash: null, // No PIN set yet - to test "Set PIN" modal!
          failed_pin_attempts: 0,
        });
        console.log(`Linked second place (${biz2.name}) WITHOUT PIN (to test Set PIN feature)`);
      }
    }
  }

  console.log('\n========================================');
  console.log('✅ TEST CUSTOMER READY!');
  console.log('========================================');
  console.log(`URL:         http://localhost:3000/login`);
  console.log(`Email:       ${TEST_EMAIL}`);
  console.log(`Password:    ${TEST_PASSWORD}`);
  console.log(`PIN:         ${TEST_PIN} (for ${biz.name})`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
