import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createOffer, getActiveOffers, getAllOffersForAdmin, uploadOfferImage } from '../lib/offers';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPhase6Tests() {
  console.log('Testing Phase 6: Offers System (Special & Daily Offers + Images & Expiry)...\n');

  let testBizId: string | null = null;

  try {
    // 1. Create demo business
    console.log('1. Creating test business for offers...');
    const { data: biz } = await adminClient
      .from('businesses')
      .insert({ name: 'Offers Cafe', subdomain: `offers-test-${Date.now()}` })
      .select().single();
    testBizId = biz.id;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    // 2. Test 6.1.2: Image upload to 'offer-images' bucket
    console.log('\n2. Testing Step 6.1.2: Upload offer image to Supabase Storage bucket...');
    // Create a tiny 1x1 GIF buffer for testing
    const sampleImageBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const uploadedUrl = await uploadOfferImage(sampleImageBuffer, 'test-offer.gif', 'image/gif');
    console.log(`   Uploaded Image Public URL: ${uploadedUrl}`);
    const isBucketUrl = uploadedUrl.includes('offer-images');
    console.log(`   Image stored in offer-images bucket: ${isBucketUrl ? 'YES' : 'NO'}`);
    if (!isBucketUrl) throw new Error('Image upload failed to return valid bucket URL');

    // 3. Test 6.1.1 & 6.3: Create active Special Offer with image_url
    console.log('\n3. Testing Steps 6.1.1 & 6.3: Special Offer with image_url...');
    const specialOffer = await createOffer({
      businessId: testBizId,
      title: 'خصم 20% على القهوة الباردة',
      description: 'استمتع بخصم 20% على جميع مشروبات القهوة الباردة طوال هذا الأسبوع.',
      type: 'special',
      startDate: todayStr,
      endDate: nextWeekStr,
      imageUrl: uploadedUrl,
    });
    console.log(`   Special offer created: [${specialOffer.id}] ${specialOffer.title}`);
    console.log(`   image_url saved: ${specialOffer.image_url === uploadedUrl ? 'YES' : 'NO'}`);
    if (specialOffer.image_url !== uploadedUrl) throw new Error('image_url not saved on offer');

    // Query active special offers
    const activeSpecialOffers = await getActiveOffers({ businessId: testBizId, type: 'special' });
    const foundSpecial = activeSpecialOffers.some(o => o.id === specialOffer.id);
    console.log(`   Active special offers found: ${activeSpecialOffers.length} — Appears: ${foundSpecial ? 'YES' : 'NO'}`);
    if (!foundSpecial) throw new Error('Special offer did not appear in active offers!');

    // 4. Test 6.4: Create active Daily Offer (Today only, without image -> testing fallback)
    console.log('\n4. Testing Step 6.4: Daily Offer (Active today, fallback without image)...');
    const dailyOffer = await createOffer({
      businessId: testBizId,
      title: 'عرض اليوم: قهوة مجانية مع أي كرواسون',
      description: 'ساري اليوم فقط حتى نفاد الكمية.',
      type: 'daily',
      startDate: todayStr,
      endDate: todayStr,
      imageUrl: null,
    });
    console.log(`   Daily offer created: [${dailyOffer.id}] ${dailyOffer.title}`);

    const activeDailyOffers = await getActiveOffers({ businessId: testBizId, type: 'daily' });
    const foundDaily = activeDailyOffers.some(o => o.id === dailyOffer.id);
    console.log(`   Active daily offers found: ${activeDailyOffers.length} — Appears: ${foundDaily ? 'YES' : 'NO'}`);
    if (!foundDaily) throw new Error('Daily offer did not appear in active daily offers!');

    // 5. Test 6.5: Expired Daily Offer (End date in the past) -> MUST NOT APPEAR!
    console.log('\n5. Testing Step 6.5: Expired Offer Automatic Hiding...');
    const expiredOffer = await createOffer({
      businessId: testBizId,
      title: 'عرض أمس المنتهي',
      description: 'عرض يومي كان سارياً أمس فقط.',
      type: 'daily',
      startDate: yesterdayStr,
      endDate: yesterdayStr,
    });
    console.log(`   Created expired offer with end_date: ${yesterdayStr}`);

    // Query active daily offers again
    const activeAfterExpired = await getActiveOffers({ businessId: testBizId, type: 'daily' });
    const expiredVisible = activeAfterExpired.some(o => o.id === expiredOffer.id);
    console.log(`   Expired offer visible to customer: ${expiredVisible ? 'LEAK (Should be hidden)' : 'HIDDEN AUTOMATICALLY'}`);
    if (expiredVisible) throw new Error('Step 6.5 Failed: Expired offer was visible to customer!');

    // 6. Test Future Offer (Starts tomorrow) -> MUST NOT APPEAR!
    console.log('\n6. Testing Future Offer (Starts tomorrow)...');
    const futureOffer = await createOffer({
      businessId: testBizId,
      title: 'عرض قادم غداً',
      description: 'يبدأ غداً.',
      type: 'special',
      startDate: tomorrowStr,
      endDate: nextWeekStr,
    });

    const activeSpecialAfterFuture = await getActiveOffers({ businessId: testBizId, type: 'special' });
    const futureVisible = activeSpecialAfterFuture.some(o => o.id === futureOffer.id);
    console.log(`   Future offer visible to customer: ${futureVisible ? 'LEAK' : 'HIDDEN (Not started yet)'}`);
    if (futureVisible) throw new Error('Future offer was visible before start date!');

    // 7. Test Admin View: Admin sees all (including expired & future)
    console.log('\n7. Testing Admin View: Admin can see all historical & scheduled offers...');
    const allAdminOffers = await getAllOffersForAdmin(testBizId);
    console.log(`   Total offers in Admin dashboard: ${allAdminOffers.length} (expected 4) ${allAdminOffers.length === 4 ? 'YES' : 'NO'}`);

    console.log('\nPhase 6 Offers Tests PASSED Successfully!');

  } catch (err: any) {
    console.error('\nPhase 6 Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (testBizId) {
      console.log('\nCleaning up test offers & business...');
      await adminClient.from('businesses').delete().eq('id', testBizId);
      console.log('Cleanup complete.');
    }
  }
}

runPhase6Tests();
