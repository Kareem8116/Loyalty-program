import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import {
  APPROVED_FONTS,
  DEFAULT_BRANDING,
  LayoutVariant,
  checkColorContrast,
} from '@/lib/branding';

const VALID_VARIANTS: LayoutVariant[] = ['centered-classic', 'qr-top', 'horizontal-offers'];

/**
 * GET /api/admin/branding?businessId=...
 * Returns the branding profile for a given business.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetBizId = searchParams.get('businessId');

    // Public / customer can read branding by businessId, or owner can read their own
    let resolvedBizId: string | null = targetBizId;

    if (!resolvedBizId) {
      const guard = await requireAuthenticatedTenant(request, {
        allowedRoles: ['super_admin', 'owner', 'branch_admin'],
      });
      if (!guard.success) return guard.response;
      resolvedBizId = guard.context.businessId || null;
    }

    if (!resolvedBizId) {
      return NextResponse.json(
        { success: false, error: 'businessId is required' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();
    const { data: branding, error } = await adminClient
      .from('business_branding')
      .select('*')
      .eq('business_id', resolvedBizId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Return existing branding or defaults
    const result = branding || {
      business_id: resolvedBizId,
      display_name: null,
      logo_url: null,
      ...DEFAULT_BRANDING,
    };

    return NextResponse.json({ success: true, branding: result });
  } catch (err: any) {
    console.error('GET /api/admin/branding error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/branding
 * Updates business branding settings. Only Owner or Super Admin can modify.
 */
export async function PATCH(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['super_admin', 'owner'],
  });
  if (!guard.success) return guard.response;

  try {
    const body = await request.json();
    const {
      businessId,
      displayName,
      logoUrl,
      primaryColor,
      accentColor,
      fontFamily,
      layoutVariant,
    } = body;

    // Tenant isolation: Owner can only modify their own business
    const targetBizId = guard.context.role === 'super_admin' ? (businessId || guard.context.businessId) : guard.context.businessId;

    if (!targetBizId) {
      return NextResponse.json(
        { success: false, error: 'Target businessId is required' },
        { status: 400 }
      );
    }

    // Validate layoutVariant (Phase 9.5.1: strictly restricted to predefined variants)
    if (layoutVariant && !VALID_VARIANTS.includes(layoutVariant)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid layout variant. Must be one of: ${VALID_VARIANTS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate fontFamily (Phase 9.5: strictly restricted to pre-approved font list)
    if (fontFamily && !APPROVED_FONTS.includes(fontFamily as any)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid font family. Must be one of: ${APPROVED_FONTS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Phase 9.5.2: Accessibility Contrast Check on colors
    let contrastWarning: string | undefined;
    let suggestedColor: string | undefined;

    if (primaryColor) {
      const contrast = checkColorContrast(primaryColor);
      if (!contrast.passesAA) {
        contrastWarning = contrast.warning;
        suggestedColor = contrast.suggestedColor;
      }
    }

    const adminClient = getServiceSupabase();

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };
    if (displayName !== undefined) updatePayload.display_name = displayName?.trim() || null;
    if (logoUrl !== undefined) updatePayload.logo_url = logoUrl?.trim() || null;
    if (primaryColor !== undefined) updatePayload.primary_color = primaryColor.trim();
    if (accentColor !== undefined) updatePayload.accent_color = accentColor.trim();
    if (fontFamily !== undefined) updatePayload.font_family = fontFamily;
    if (layoutVariant !== undefined) updatePayload.layout_variant = layoutVariant;

    // Upsert into business_branding
    const { data: updated, error: upsertErr } = await adminClient
      .from('business_branding')
      .upsert({
        business_id: targetBizId,
        ...updatePayload,
      }, { onConflict: 'business_id' })
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    return NextResponse.json({
      success: true,
      branding: updated,
      contrastWarning,
      suggestedColor,
    });
  } catch (err: any) {
    console.error('PATCH /api/admin/branding error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
