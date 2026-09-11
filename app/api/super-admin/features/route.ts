import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { 
  getBusinessFeaturesWithDefs, 
  setBusinessFeature, 
  setAllBusinessFeatures,
  setBusinessFeaturesBulk 
} from '@/lib/features';
import { getBusinessNotificationSettings } from '@/lib/notifications';
import { getBusinessAiSettings, saveBusinessAiSettings } from '@/lib/recommendations';
import { getBusinessSmsSettings, updateBusinessSmsSettings } from '@/lib/sms';

/**
 * Super Admin Feature Control & Notification Settings API
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const adminClient = getServiceSupabase();
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify Super Admin role
    const { data: userRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!userRole || userRole.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const businessId = request.nextUrl.searchParams.get('businessId');
    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId parameter' }, { status: 400 });
    }

    const [featuresData, notificationSettings, aiSettings, smsSettings] = await Promise.all([
      getBusinessFeaturesWithDefs(businessId),
      getBusinessNotificationSettings(businessId),
      getBusinessAiSettings(businessId),
      getBusinessSmsSettings(businessId),
    ]);

    return NextResponse.json({
      success: true,
      definitions: featuresData.definitions,
      features: featuresData.features,
      notificationSettings,
      aiSettings: aiSettings ? { has_api_key: !!aiSettings.gemini_api_key, model: aiSettings.model } : null,
      smsSettings: smsSettings ? {
        provider: smsSettings.provider || 'mock',
        account_sid: smsSettings.account_sid || '',
        sender_id: smsSettings.sender_id || '',
        has_auth_token: Boolean(smsSettings.auth_token),
      } : null,
    });
  } catch (error: any) {
    console.error('API /api/super-admin/features GET error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const adminClient = getServiceSupabase();
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify Super Admin role
    const { data: userRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!userRole || userRole.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { businessId, bulkAction, features, featureKey, isEnabled, notificationSettings } = body;

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    // 1. Phase 22.6: Bulk action (enable_all / disable_all) in a single operation
    if (bulkAction === 'enable_all' || bulkAction === 'disable_all') {
      await setAllBusinessFeatures(businessId, bulkAction === 'enable_all', user.id);
    } 
    // 2. Bulk features map in a single operation
    else if (features && typeof features === 'object') {
      await setBusinessFeaturesBulk(businessId, features, user.id);
    } 
    // 3. Individual feature toggle
    else if (featureKey !== undefined && isEnabled !== undefined) {
      await setBusinessFeature(businessId, featureKey, Boolean(isEnabled), user.id);
    }

    // 4. If notificationSettings are passed, update them
    if (notificationSettings) {
      const { provider = 'whatsapp', phoneNumberId, accessToken } = notificationSettings;

      const { error: notifErr } = await adminClient
        .from('business_notification_settings')
        .upsert(
          {
            business_id: businessId,
            provider,
            phone_number_id: phoneNumberId || null,
            access_token: accessToken || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'business_id' }
        );

      if (notifErr) {
        throw new Error(`Failed to save notification settings: ${notifErr.message}`);
      }
    }

    // 5. Phase 24.3: If aiSettings are passed, update them
    if (body.aiSettings && body.aiSettings.geminiApiKey) {
      const { geminiApiKey, model } = body.aiSettings;
      const aiResult = await saveBusinessAiSettings({
        businessId,
        geminiApiKey,
        model: model || 'gemini-1.5-flash',
      });
      if (!aiResult.success) {
        throw new Error(`Failed to save AI settings: ${aiResult.error}`);
      }
    }

    // 6. Phase 30.3: If smsSettings are passed, update them
    if (body.smsSettings) {
      const { provider = 'mock', accountSid, authToken, senderId } = body.smsSettings;
      let finalAuthToken = authToken;
      if (authToken === '••••••••••••••••') {
        const existing = await getBusinessSmsSettings(businessId);
        finalAuthToken = existing?.auth_token || null;
      }

      await updateBusinessSmsSettings({
        business_id: businessId,
        provider: provider === 'twilio' ? 'twilio' : 'mock',
        account_sid: accountSid || null,
        auth_token: finalAuthToken || null,
        sender_id: senderId || 'Pointat',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /api/super-admin/features PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
