import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🔑 Syncing test account passwords...');

  // Get Demo Coffee and Branch
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('subdomain', 'demo-coffee')
    .single();

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('business_id', biz!.id)
    .single();

  const accounts = [
    { email: 'superadmin@loyalty.system', pass: 'SuperAdmin2026!', role: 'super_admin', bizId: null, branchId: null },
    { email: 'owner.test@pointat.net', pass: 'Password123!', role: 'owner', bizId: biz!.id, branchId: null },
    { email: 'cashier.test@pointat.net', pass: 'Password123!', role: 'cashier', bizId: biz!.id, branchId: branch!.id },
    { email: 'customer@pointat.net', pass: 'Customer123!', role: 'customer', bizId: null, branchId: null },
  ];

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  for (const acc of accounts) {
    let user = users?.find(u => u.email === acc.email);
    if (!user) {
      console.log(`Creating user ${acc.email}...`);
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: acc.pass,
        email_confirm: true,
      });
      if (error) console.error('Error creating user:', error);
      user = created?.user;
    } else {
      console.log(`Updating password for ${acc.email}...`);
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        password: acc.pass,
        email_confirm: true,
      });
      if (error) console.error('Error updating user:', error);
    }

    if (user && acc.role !== 'customer') {
      // Upsert role
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingRole) {
        await supabase
          .from('user_roles')
          .update({
            role: acc.role,
            business_id: acc.bizId,
            branch_id: acc.branchId,
          })
          .eq('id', existingRole.id);
      } else {
        await supabase
          .from('user_roles')
          .insert({
            user_id: user.id,
            role: acc.role,
            business_id: acc.bizId,
            branch_id: acc.branchId,
          });
      }
      console.log(`  -> Role [${acc.role}] configured for ${acc.email}`);
    }
  }

  console.log('✅ All test passwords & roles synced successfully!');
}

main().catch(console.error);
