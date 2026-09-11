import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { assertFeatureEnabled } from '@/lib/features';

/**
 * GET /api/admin/notifications
 * Returns the current notification settings for the business.
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
      .from('business_notification_settings')
      .select('id, provider, phone_number_id, created_at, updated_at')
      // NOTE: access_token is intentionally excluded from SELECT (Data Minimization – RULES.md 2.3)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ success: true, settings: data });
  } catch (err: any) {
    console.error('GET /api/admin/notifications error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/notifications
 * Upserts notification settings for the business.
 * Only owners can configure notification credentials (sensitive operation).
 *
 * Accepted fields:
 *   provider        — "whatsapp" (default)
 *   phone_number_id — WhatsApp Cloud API phone number ID
 *   access_token    — WhatsApp Cloud API permanent access token (stored as-is; consider encryption at rest via Vault in production)
 *   is_enabled      — If true, also enables 'notifications' feature flag for this business
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
    const { provider, phone_number_id, access_token, is_enabled } = body;

    // Validate provider
    const VALID_PROVIDERS = ['whatsapp'];
    if (provider && !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { success: false, error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!phone_number_id?.trim() || !access_token?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: phone_number_id and access_token' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Upsert notification settings
    const { data: settings, error: upsertErr } = await adminClient
      .from('business_notification_settings')
      .upsert(
        {
          business_id: businessId,
          provider: provider || 'whatsapp',
          phone_number_id: phone_number_id.trim(),
          access_token: access_token.trim(),
        },
        { onConflict: 'business_id' }
      )
      .select('id, provider, phone_number_id, updated_at')
      .single();

    if (upsertErr) throw upsertErr;

    // If is_enabled=true, also enable the 'notifications' feature flag
    if (is_enabled === true) {
      await adminClient
        .from('business_features')
        .upsert(
          {
            business_id: businessId,
            feature_key: 'notifications',
            is_enabled: true,
            updated_by: userId,
          },
          { onConflict: 'business_id,feature_key' }
        );
    }

    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    console.error('PUT /api/admin/notifications error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/notifications
 * Removes notification credentials and disables the feature flag.
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

    // Delete notification settings
    const { error: deleteErr } = await adminClient
      .from('business_notification_settings')
      .delete()
      .eq('business_id', businessId);

    if (deleteErr) throw deleteErr;

    // Disable 'notifications' feature flag
    await adminClient
      .from('business_features')
      .upsert(
        {
          business_id: businessId,
          feature_key: 'notifications',
          is_enabled: false,
          updated_by: userId,
        },
        { onConflict: 'business_id,feature_key' }
      );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/admin/notifications error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
