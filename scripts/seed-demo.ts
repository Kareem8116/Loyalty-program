import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function seedDemoData() {
  console.log('🌱 Seeding rich demo data for interactive user testing...');

  // 1. Check or create demo business
  let { data: biz } = await adminClient
    .from('businesses')
    .select('id, name')
    .eq('subdomain', 'demo-coffee')
    .maybeSingle();

  if (!biz) {
    const { data: newBiz } = await adminClient
      .from('businesses')
      .insert({
        name: 'كافيه الروستري (Roastery Cafe)',
        subdomain: 'demo-coffee',
        is_active: true,
      })
      .select().single();
    biz = newBiz;
  }

  const bizId = biz.id;

  // 2. Check or create demo branch
  let { data: branch } = await adminClient
    .from('branches')
    .select('id')
    .eq('business_id', bizId)
    .maybeSingle();

  if (!branch) {
    const { data: newBranch } = await adminClient
      .from('branches')
      .insert({ business_id: bizId, name: 'فرع المعادي الرئيسي' })
      .select().single();
    branch = newBranch;
  }

  // 3. Set redemption rates
  await adminClient
    .from('redemption_rates')
    .upsert({
      business_id: bizId,
      points_per_currency_unit: 1.0,
      currency_per_point: 0.1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' });

  // 4. Seed menu items
  const menuItemsToInsert = [
    { business_id: bizId, branch_id: branch.id, name: 'سبانش لاتيه بارد (Iced Spanish Latte)', price: 85.0 },
    { business_id: bizId, branch_id: branch.id, name: 'كراميل ماكياتو (Caramel Macchiato)', price: 95.0 },
    { business_id: bizId, branch_id: branch.id, name: 'قهوة أمريكانو (Caffe Americano)', price: 55.0 },
    { business_id: bizId, branch_id: branch.id, name: 'كرواسون زبدة طازج (Butter Croissant)', price: 45.0 },
  ];

  for (const item of menuItemsToInsert) {
    const { data: exists } = await adminClient
      .from('menu_items')
      .select('id')
      .eq('business_id', bizId)
      .eq('name', item.name)
      .maybeSingle();

    if (!exists) {
      await adminClient.from('menu_items').insert(item);
    }
  }

  // 5. Create or get customer
  let { data: customer } = await adminClient
    .from('customers')
    .select('id, name, qr_token')
    .eq('business_id', bizId)
    .eq('phone_number', '+201012345678')
    .maybeSingle();

  if (!customer) {
    const { data: newCust } = await adminClient
      .from('customers')
      .insert({
        business_id: bizId,
        name: 'كريم يونس',
        phone_number: '+201012345678',
      })
      .select().single();
    customer = newCust;

    // Add initial points in ledger (+250 points)
    await adminClient.from('points_ledger').insert([
      { business_id: bizId, customer_id: customer.id, points_change: 150, reason: 'welcome_points' },
      { business_id: bizId, customer_id: customer.id, points_change: 100, reason: 'first_order_bonus' }
    ]);
  }

  // Assign Super Admin to this business in user_roles if not already set
  const { data: superAdminUser } = await adminClient
    .from('user_roles')
    .select('id, user_id')
    .eq('role', 'super_admin')
    .maybeSingle();

  if (superAdminUser) {
    await adminClient
      .from('user_roles')
      .update({ business_id: bizId, branch_id: branch.id })
      .eq('id', superAdminUser.id);
  }

  console.log('✅ Demo data ready!');
  console.log('Business ID:', bizId);
  console.log('Customer Name:', customer.name);
  console.log('Customer QR Token:', customer.qr_token);
}

seedDemoData();
