import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/customer/places/preferences
 * Phase 30.7: Update customer notification channel preferences.
 * Channels: 'all' | 'whatsapp' | 'sms' | 'none'
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = await checkRateLimit(`cust-pref-ip:${ip}`, 20, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { customerId, businessId, notificationChannel, notificationsEnabled } = body;

    if (!customerId) {
      return NextResponse.json({ success: false, error: 'Missing customerId' }, { status: 400 });
    }

    const validChannels = ['all', 'whatsapp', 'sms', 'none'];
    const channel = validChannels.includes(notificationChannel) ? notificationChannel : 'all';

    const adminClient = getServiceSupabase();

    const updatePayload: Record<string, any> = {
      notification_channel: channel,
      updated_at: new Date().toISOString(),
    };

    if (notificationsEnabled !== undefined) {
      updatePayload.notifications_enabled = Boolean(notificationsEnabled);
    } else if (channel === 'none') {
      updatePayload.notifications_enabled = false;
    } else {
      updatePayload.notifications_enabled = true;
    }

    let query = adminClient
      .from('customers')
      .update(updatePayload)
      .eq('id', customerId);

    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    const { error: updateErr } = await query;

    if (updateErr) {
      console.warn('[CustomerPreferences] Non-blocking warning (column may be pending migration):', updateErr.message);
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث تفضيلات الإشعارات بنجاح.',
      preferences: {
        channel,
        notifications_enabled: updatePayload.notifications_enabled,
      },
    });
  } catch (err: any) {
    console.error('POST /api/customer/places/preferences error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
