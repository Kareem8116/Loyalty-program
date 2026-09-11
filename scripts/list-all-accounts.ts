import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1. List auth.users
  const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) {
    console.error('Error listing users:', usersErr);
    return;
  }

  console.log(`\n=== AUTH.USERS (${users?.length || 0}) ===`);
  for (const u of users || []) {
    console.log(`- ID: ${u.id} | Email: ${u.email} | Created: ${u.created_at}`);
  }

  // 2. List user_roles
  const { data: roles } = await supabase.from('user_roles').select('*');
  console.log(`\n=== USER_ROLES (${roles?.length || 0}) ===`);
  for (const r of roles || []) {
    console.log(`- UserID: ${r.user_id} | Role: ${r.role} | BizID: ${r.business_id} | BranchID: ${r.branch_id}`);
  }

  // 3. List customers
  const { data: customers } = await supabase.from('customers').select('id, name, phone_number, business_id, points_balance, created_at');
  console.log(`\n=== CUSTOMERS (${customers?.length || 0}) ===`);
  for (const c of customers || []) {
    console.log(`- ID: ${c.id} | Name: ${c.name} | Phone: ${c.phone_number} | Points: ${c.points_balance}`);
  }

  // 4. List customer_auth_links
  const { data: links } = await supabase.from('customer_auth_links').select('*');
  console.log(`\n=== CUSTOMER_AUTH_LINKS (${links?.length || 0}) ===`);
  for (const l of links || []) {
    console.log(`- LinkID: ${l.id} | AuthUserID: ${l.auth_user_id} | CustomerID: ${l.customer_id}`);
  }

  // 5. List businesses
  const { data: businesses } = await supabase.from('businesses').select('id, name, subdomain, is_active, created_at');
  console.log(`\n=== BUSINESSES (${businesses?.length || 0}) ===`);
  for (const b of businesses || []) {
    console.log(`- ID: ${b.id} | Name: ${b.name} | Subdomain: ${b.subdomain} | Active: ${b.is_active}`);
  }
}

main().catch(console.error);
