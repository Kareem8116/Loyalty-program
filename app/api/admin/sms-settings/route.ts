import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/sms-settings
 * Phase 30.2: Returns current SMS settings for the business.
 * auth_token is NEVER returned (Data Minimization — RULES.md 2.3).
 */
export async function GET(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['super_admin', 'owner'],
  });
  if (!guard.success) return guard.response;

  const { businessId } = guard.context;
  if (!businessId) {
    return NextResponse.json({ success: false, error: 'No business assigned' }, { status: 400 });
  }

  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('business_sms_settings')
      // auth_token intentionally excluded (Data Minimization)
      .select('id, provider, account_sid, sender_id, created_at, updated_at')
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ success: true, settings: data });
  } catch (err: any) {
    console.error('GET /api/admin/sms-settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/sms-settings
 * Phase 30.2 & 30.3: Upserts SMS credentials for the business (owner-only).
 *
 * Body:
 *   provider      — 'twilio' | 'mock'
 *   account_sid   — Twilio Account SID
 *   auth_token    — Twilio Auth Token (write-only; never returned)
 *   sender_id     — Phone number or alphanumeric sender ID
 *   is_enabled    — If true, also enables 'sms_notifications' feature flag
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['owner'],
  });
  if (!guard.success) return guard.response;

  const { businessId, userId } = guard.context;
  if (!businessId) {
    return NextResponse.json({ success: false, error: 'No business assigned' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { provider, account_sid, auth_token, sender_id, is_enabled } = body;

    const VALID_PROVIDERS = ['twilio', 'mock'];
    if (provider && !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { success: false, error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    if (provider === 'twilio' && (!account_sid?.trim() || !auth_token?.trim() || !sender_id?.trim())) {
      return NextResponse.json(
        { success: false, error: 'Twilio requires: account_sid, auth_token, and sender_id' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Build upsert payload — only include auth_token if provided (partial update)
    const upsertPayload: Record<string, any> = {
      business_id: businessId,
      provider: provider || 'twilio',
      account_sid: account_sid?.trim() || null,
      sender_id: sender_id?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (auth_token?.trim()) {
      upsertPayload.auth_token = auth_token.trim();
    }

    const { data: settings, error: upsertErr } = await adminClient
      .from('business_sms_settings')
      .upsert(upsertPayload, { onConflict: 'business_id' })
      .select('id, provider, account_sid, sender_id, updated_at')
      .single();

    if (upsertErr) throw upsertErr;

    // Phase 30.6: Update sms_notifications feature flag
    if (typeof is_enabled === 'boolean') {
      await adminClient
        .from('business_features')
        .upsert(
          {
            business_id: businessId,
            feature_key: 'sms_notifications',
            is_enabled,
            updated_by: userId,
          },
          { onConflict: 'business_id,feature_key' }
        );
    }

    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    console.error('PUT /api/admin/sms-settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sms-settings
 * Removes SMS credentials and disables the feature flag.
 */
export async function DELETE(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['owner'],
  });
  if (!guard.success) return guard.response;

  const { businessId, userId } = guard.context;
  if (!businessId) {
    return NextResponse.json({ success: false, error: 'No business assigned' }, { status: 400 });
  }

  try {
    const adminClient = getServiceSupabase();

    await adminClient
      .from('business_sms_settings')
      .delete()
      .eq('business_id', businessId);

    // Disable sms_notifications feature flag
    await adminClient
      .from('business_features')
      .upsert(
        {
          business_id: businessId,
          feature_key: 'sms_notifications',
          is_enabled: false,
          updated_by: userId,
        },
        { onConflict: 'business_id,feature_key' }
      );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/admin/sms-settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
