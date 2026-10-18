import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUPER_ADMIN_EMAIL = 'kareemyounis75@gmail.com';

async function main() {
  console.log('🧹 Production Cleanup Script');
  console.log('=============================');
  console.log(`Preserving ONLY: ${SUPER_ADMIN_EMAIL}\n`);

  // 1. Get all users
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr || !users) {
    console.error('❌ Failed to list users:', listErr);
    process.exit(1);
  }

  const superAdminUser = users.find(u => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  if (!superAdminUser) {
    console.error(`❌ CRITICAL: Super admin ${SUPER_ADMIN_EMAIL} not found! Aborting.`);
    process.exit(1);
  }
  console.log(`✅ Super Admin found: ${superAdminUser.id}\n`);

  // 2. Clean all businesses (cascade should handle related data)
  console.log('🗑️  Deleting all businesses...');
  const { data: businesses } = await supabase.from('businesses').select('id, name');
  for (const biz of businesses || []) {
    console.log(`   Deleting business: ${biz.name}`);
    await supabase.from('businesses').delete().eq('id', biz.id);
  }
  console.log(`   ✓ Deleted ${businesses?.length || 0} businesses\n`);

  // 3. Clean all customer_auth_links
  console.log('🗑️  Deleting all customer_auth_links...');
  const { count: linksCount } = await supabase
    .from('customer_auth_links')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all
    .select('*', { count: 'exact', head: true });
  console.log(`   ✓ Deleted customer_auth_links\n`);

  // 4. Clean all user_roles except super admin
  console.log('🗑️  Deleting non-super-admin user_roles...');
  await supabase.from('user_roles').delete().neq('user_id', superAdminUser.id);
  // Ensure super admin role is correct
  const { data: saRole } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', superAdminUser.id)
    .maybeSingle();
  if (!saRole) {
    await supabase.from('user_roles').insert({
      user_id: superAdminUser.id,
      role: 'super_admin',
      business_id: null,
      branch_id: null,
    });
    console.log('   ✓ Created super_admin role for ' + SUPER_ADMIN_EMAIL);
  } else {
    await supabase.from('user_roles')
      .update({ role: 'super_admin', business_id: null, branch_id: null })
      .eq('user_id', superAdminUser.id);
    console.log('   ✓ Confirmed super_admin role for ' + SUPER_ADMIN_EMAIL);
  }
  console.log();

  // 5. Delete all auth users except super admin
  const usersToDelete = users.filter(u => u.id !== superAdminUser.id);
  console.log(`🗑️  Deleting ${usersToDelete.length} auth users...`);
  for (const u of usersToDelete) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`   ❌ Failed: ${u.email} - ${delErr.message}`);
    } else {
      console.log(`   ✓ Deleted: ${u.email}`);
    }
  }
  console.log();

  // 6. Final verification
  console.log('📋 FINAL VERIFICATION');
  console.log('======================');
  const { data: { users: finalUsers } } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const { data: finalRoles } = await supabase.from('user_roles').select('*');
  const { data: finalBusinesses } = await supabase.from('businesses').select('id, name, subdomain');
  const { data: finalLinks } = await supabase.from('customer_auth_links').select('id');

  console.log(`Auth Users (${finalUsers?.length}):`);;
  for (const u of finalUsers || []) {
    console.log(`  ✅ ${u.email}`);
  }

  console.log(`\nUser Roles (${finalRoles?.length}):`);
  for (const r of finalRoles || []) {
    console.log(`  ✅ Role: ${r.role} | BizID: ${r.business_id}`);
  }

  console.log(`\nBusinesses remaining: ${finalBusinesses?.length || 0}`);
  console.log(`Customer Auth Links remaining: ${finalLinks?.length || 0}`);

  console.log('\n🎉 Production cleanup complete! Database is clean and ready.\n');
}

main().catch(console.error);
