import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUPER_ADMIN_EMAIL = 'kareemyounis75@gmail.com';

async function main() {
  console.log(`\nStarting cleanup. Preserving Super Admin: ${SUPER_ADMIN_EMAIL}`);

  // 1. Get all users
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr || !users) {
    console.error('Failed to list users:', listErr);
    process.exit(1);
  }

  const superAdminUser = users.find(u => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  if (!superAdminUser) {
    console.error(`CRITICAL: Super admin account ${SUPER_ADMIN_EMAIL} was not found! Aborting.`);
    process.exit(1);
  }

  console.log(`Found Super Admin User ID: ${superAdminUser.id}`);

  // Ensure Super Admin has global super_admin role in user_roles
  const { data: saRole } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', superAdminUser.id)
    .maybeSingle();

  if (!saRole) {
    console.log('Inserting super_admin role for', superAdminUser.email);
    await supabase.from('user_roles').insert({
      user_id: superAdminUser.id,
      role: 'super_admin',
      business_id: null,
      branch_id: null,
    });
  } else {
    // Ensure clean global access
    await supabase
      .from('user_roles')
      .update({ role: 'super_admin', business_id: null, branch_id: null })
      .eq('user_id', superAdminUser.id);
  }

  // 2. Identify all other users to delete
  const usersToDelete = users.filter(u => u.id !== superAdminUser.id);
  console.log(`Total users to delete: ${usersToDelete.length}`);

  for (const u of usersToDelete) {
    console.log(`Deleting user: ${u.email} (${u.id})...`);
    
    // Delete roles first explicitly if any
    await supabase.from('user_roles').delete().eq('user_id', u.id);

    // Delete customer auth links if any
    await supabase.from('customer_auth_links').delete().eq('auth_user_id', u.id);

    // Delete from auth.users
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`  Failed to delete auth user ${u.email}:`, delErr.message);
    } else {
      console.log(`  ✓ Successfully deleted ${u.email}`);
    }
  }

  // 3. Clean orphan customer_auth_links if any remain
  const { data: orphanLinks } = await supabase
    .from('customer_auth_links')
    .select('id, auth_user_id')
    .neq('auth_user_id', superAdminUser.id);

  if (orphanLinks && orphanLinks.length > 0) {
    console.log(`Cleaning ${orphanLinks.length} orphan customer links...`);
    await supabase.from('customer_auth_links').delete().neq('auth_user_id', superAdminUser.id);
  }

  // 4. Clean orphan user_roles if any remain
  const { data: orphanRoles } = await supabase
    .from('user_roles')
    .select('id, user_id')
    .neq('user_id', superAdminUser.id);

  if (orphanRoles && orphanRoles.length > 0) {
    console.log(`Cleaning ${orphanRoles.length} orphan roles...`);
    await supabase.from('user_roles').delete().neq('user_id', superAdminUser.id);
  }

  // 5. Verification
  const { data: { users: finalUsers } } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const { data: finalRoles } = await supabase.from('user_roles').select('*');

  console.log('\n=== FINAL VERIFICATION ===');
  console.log(`Remaining Auth Users (${finalUsers?.length}):`);
  for (const u of finalUsers || []) {
    console.log(`- ${u.email} (${u.id})`);
  }

  console.log(`Remaining User Roles (${finalRoles?.length}):`);
  for (const r of finalRoles || []) {
    console.log(`- User: ${r.user_id} | Role: ${r.role}`);
  }

  console.log('\nCleanup finished successfully!');
}

main().catch(console.error);
