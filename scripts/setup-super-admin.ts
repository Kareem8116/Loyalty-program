import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Check existing super_admin
  const { data: existing } = await supabase
    .from('user_roles')
    .select('user_id, role, business_id')
    .eq('role', 'super_admin');

  console.log('Existing super_admin roles:', JSON.stringify(existing, null, 2));

  if (existing && existing.length > 0) {
    for (const r of existing) {
      const { data: u } = await supabase.auth.admin.getUserById(r.user_id);
      console.log('Super Admin email:', u?.user?.email);
    }
    console.log('Super Admin already exists. No action needed.');
    process.exit(0);
  }

  // Create super_admin user
  console.log('\nNo super_admin found. Creating one...');
  
  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email: 'superadmin@loyalty.system',
    password: 'SuperAdmin2026!',
    email_confirm: true,
  });

  if (createErr || !newUser.user) {
    console.error('Failed to create super admin auth user:', createErr);
    process.exit(1);
  }

  console.log('Created auth user:', newUser.user.id, newUser.user.email);

  // Create user_role with role=super_admin (no business_id - super admin is global)
  const { error: roleErr } = await supabase.from('user_roles').insert({
    user_id: newUser.user.id,
    role: 'super_admin',
    business_id: null,
    branch_id: null,
  });

  if (roleErr) {
    console.error('Failed to assign super_admin role:', roleErr);
    process.exit(1);
  }

  console.log('Super Admin created successfully!');
  console.log('Email: superadmin@loyalty.system');
  console.log('Password: SuperAdmin2026!');
  process.exit(0);
}

main().catch(console.error);
