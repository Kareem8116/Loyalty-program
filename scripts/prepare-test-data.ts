import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createCustomer } from '../lib/customer';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🚀 Preparing test data for Demo Coffee (806d00f6-0624-446c-af1d-2a7c76a9743e)...');

  // 1. Get or create Demo Coffee business
  let { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('subdomain', 'demo-coffee')
    .maybeSingle();

  if (!biz) {
    const { data: newBiz, error } = await supabase
      .from('businesses')
      .insert({
        name: 'Demo Coffee',
        subdomain: 'demo-coffee',
        is_active: true,
      })
      .select()
      .single();
    if (error) console.error('Error creating biz:', error);
    biz = newBiz;
  }
  const bizId = biz.id;
  console.log('Business:', biz.name, biz.id);

  // 2. Ensure Branch exists
  let { data: branch } = await supabase
    .from('branches')
    .select('*')
    .eq('business_id', bizId)
    .maybeSingle();

  if (!branch) {
    const { data: newBranch, error } = await supabase
      .from('branches')
      .insert({
        business_id: bizId,
        name: 'فرع المعادي الرئيسي (Main Branch)',
      })
      .select()
      .single();
    if (error) console.error('Error creating branch:', error);
    branch = newBranch;
  }
  console.log('Branch:', branch?.name, branch?.id);

  // 3. Update Cashier to have branch_id
  const { data: cashierRole } = await supabase
    .from('user_roles')
    .select('*')
    .eq('role', 'cashier')
    .eq('business_id', bizId)
    .maybeSingle();

  if (cashierRole && branch) {
    const { error: updErr } = await supabase
      .from('user_roles')
      .update({ branch_id: branch.id })
      .eq('id', cashierRole.id);
    console.log('Updated cashier branch_id:', updErr ? updErr.message : 'OK');
  }

  // 4. Ensure redemption_rates
  const { error: rateErr } = await supabase
    .from('redemption_rates')
    .upsert({
      business_id: bizId,
      points_per_currency_unit: 1.0,
      currency_per_point: 0.1,
    }, { onConflict: 'business_id' });
  console.log('Redemption rates upsert:', rateErr ? rateErr.message : 'OK');

  // 5. Ensure branding
  const { error: brandErr } = await supabase
    .from('business_branding')
    .upsert({
      business_id: bizId,
      display_name: 'Demo Coffee Roasters',
      primary_color: '#3b82f6',
      accent_color: '#10b981',
      font_family: 'Inter',
      layout_variant: 'centered-classic',
    }, { onConflict: 'business_id' });
  console.log('Branding upsert:', brandErr ? brandErr.message : 'OK');

  // 6. Ensure Menu Items
  const menuItems = [
    { business_id: bizId, branch_id: branch?.id, name: 'سبانش لاتيه بارد (Spanish Latte)', price: 75.0 },
    { business_id: bizId, branch_id: branch?.id, name: 'فلات وايت (Flat White)', price: 65.0 },
    { business_id: bizId, branch_id: branch?.id, name: 'كولد برو (Cold Brew)', price: 80.0 },
    { business_id: bizId, branch_id: branch?.id, name: 'كوكيز شوكولاتة (Chocolate Cookie)', price: 40.0 },
  ];
  for (const m of menuItems) {
    const { data: exists } = await supabase
      .from('menu_items')
      .select('id')
      .eq('business_id', bizId)
      .eq('name', m.name)
      .maybeSingle();
    if (!exists) {
      await supabase.from('menu_items').insert(m);
    }
  }
  console.log('Menu items seeded.');

  // 7. Ensure Offers
  await supabase.from('offers').delete().eq('business_id', bizId);
  const todayDateStr = new Date().toISOString().split('T')[0];
  const nextMonthDateStr = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  await supabase.from('offers').insert([
    {
      business_id: bizId,
      title: 'عرض الصباح: قهوة + كوكيز بـ 90 جنيه',
      description: 'احصل على قهوتك المفضلة مع كوكيز طازج بسعر خاص يومياً حتى الساعة 12 ظهراً.',
      type: 'daily',
      is_active: true,
      start_date: todayDateStr,
      end_date: nextMonthDateStr,
    },
    {
      business_id: bizId,
      title: 'نقاط مضاعفة 2X في نهاية الأسبوع',
      description: 'اكسب ضعف النقاط على جميع المشروبات الباردة يومي الجمعة والسبت!',
      type: 'special',
      is_active: true,
      start_date: todayDateStr,
      end_date: nextMonthDateStr,
    }
  ]);
  console.log('Offers seeded.');

  // 8. Ensure Tiers
  const tiers = [
    { business_id: bizId, name: 'برونزي (Bronze)', min_points: 0, badge_color: '#cd7f32' },
    { business_id: bizId, name: 'فضي (Silver)', min_points: 500, badge_color: '#c0c0c0' },
    { business_id: bizId, name: 'ذهبي (Gold)', min_points: 1500, badge_color: '#ffd700' },
  ];
  for (const t of tiers) {
    const { data: exists } = await supabase
      .from('tiers')
      .select('id')
      .eq('business_id', bizId)
      .eq('name', t.name)
      .maybeSingle();
    if (!exists) {
      await supabase.from('tiers').insert(t);
    }
  }
  console.log('Tiers seeded.');

  // 9. Ensure Referral settings
  await supabase
    .from('referral_settings')
    .upsert({
      business_id: bizId,
      referrer_bonus_points: 50,
      referee_bonus_points: 25,
      is_enabled: true,
    }, { onConflict: 'business_id' });
  console.log('Referral settings seeded.');

  // 10. Ensure customer
  let { data: cust } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', bizId)
    .eq('phone_number', '+201012345678')
    .maybeSingle();

  if (!cust) {
    cust = await createCustomer({
      businessId: bizId,
      name: 'كريم يونس التجريبي',
      phoneNumber: '+201012345678',
      consentGiven: true,
    });
    // Add initial points to ledger
    await supabase.from('points_ledger').insert([
      { business_id: bizId, customer_id: cust.id, points_change: 250, reason: 'welcome_points' },
    ]);
  }
  console.log('Customer:', cust?.name, cust?.id, cust?.qr_token);

  console.log('🎉 Preparation complete!');
}

main().catch(console.error);
