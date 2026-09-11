import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getBusinessSmsSettings, updateBusinessSmsSettings, sendCustomerSms } from '@/lib/sms';

/**
 * GET /api/admin/settings/sms
 * Fetches SMS configuration for a business. Allowed for super_admin and owner.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const settings = await getBusinessSmsSettings(businessId);

    // Mask auth_token for security
    const maskedSettings = settings ? {
      ...settings,
      auth_token: settings.auth_token ? '••••••••••••••••' : null,
      has_auth_token: Boolean(settings.auth_token),
    } : null;

    return NextResponse.json({ success: true, settings: maskedSettings });
  } catch (err: any) {
    console.error('GET /api/admin/settings/sms error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings/sms
 * Saves or updates SMS settings for a business.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { businessId, provider, accountSid, authToken, senderId, testRecipient } = body;

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const validProviders = ['mock', 'twilio'];
    const chosenProvider = validProviders.includes(provider) ? provider : 'mock';

    // If authToken is masked, keep existing token
    let finalAuthToken = authToken;
    if (authToken === '••••••••••••••••') {
      const existing = await getBusinessSmsSettings(businessId);
      finalAuthToken = existing?.auth_token || null;
    }

    await updateBusinessSmsSettings({
      business_id: businessId,
      provider: chosenProvider as 'mock' | 'twilio',
      account_sid: accountSid?.trim() || null,
      auth_token: finalAuthToken?.trim() || null,
      sender_id: senderId?.trim() || 'Pointat',
    });

    // Optional test SMS
    let testResult: any = null;
    if (testRecipient && typeof testRecipient === 'string') {
      testResult = await sendCustomerSms({
        businessId,
        customerId: guard.context.userId,
        type: 'points_added',
        data: { customMessage: 'Pointat: هذه رسالة تجريبية لتأكيد نجاح ربط خدمة الرسائل النصية SMS.' },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ إعدادات الرسائل القصيرة SMS بنجاح.',
      testResult,
    });
  } catch (err: any) {
    console.error('POST /api/admin/settings/sms error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
