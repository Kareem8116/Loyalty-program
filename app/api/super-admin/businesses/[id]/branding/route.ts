import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { clearTenantCache } from '@/lib/tenant';

/**
 * GET /api/super-admin/businesses/[id]/branding
 * Returns the branding record for a specific business. Super Admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  const { id } = await params;

  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('business_branding')
      .select('*')
      .eq('business_id', id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'No branding record found for this business' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, branding: data });
  } catch (err: any) {
    console.error(`GET /api/super-admin/businesses/${id}/branding error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/super-admin/businesses/[id]/branding
 * Upserts the branding record for a specific business. Super Admin only.
 *
 * Accepted fields:
 *   display_name   — string (name shown in customer-facing UI)
 *   logo_url       — string | null
 *   primary_color  — string (hex, e.g. "#FAF7F2")
 *   accent_color   — string (hex, e.g. "#B08968")
 *   font_family    — string ("Inter" | "Outfit" | "Cairo" | "Tajawal")
 *   layout_variant — "centered-classic" | "qr-top" | "horizontal-offers"
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      display_name,
      logo_url,
      primary_color,
      accent_color,
      font_family,
      layout_variant,
    } = body;

    // Validate layout_variant if provided
    const VALID_LAYOUTS = ['centered-classic', 'qr-top', 'horizontal-offers'];
    if (layout_variant && !VALID_LAYOUTS.includes(layout_variant)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid layout_variant. Must be one of: ${VALID_LAYOUTS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate font_family if provided
    const VALID_FONTS = ['Inter', 'Outfit', 'Cairo', 'Tajawal'];
    if (font_family && !VALID_FONTS.includes(font_family)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid font_family. Must be one of: ${VALID_FONTS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Verify business exists
    const { data: biz, error: bizErr } = await adminClient
      .from('businesses')
      .select('id, subdomain')
      .eq('id', id)
      .maybeSingle();

    if (bizErr || !biz) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      );
    }

    // Upsert branding (create if not exists, update if exists)
    const { data: updated, error: upsertErr } = await adminClient
      .from('business_branding')
      .upsert(
        {
          business_id: id,
          ...(display_name !== undefined && { display_name }),
          ...(logo_url !== undefined && { logo_url }),
          ...(primary_color !== undefined && { primary_color }),
          ...(accent_color !== undefined && { accent_color }),
          ...(font_family !== undefined && { font_family }),
          ...(layout_variant !== undefined && { layout_variant }),
        },
        { onConflict: 'business_id' }
      )
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    // Invalidate tenant cache so new branding is served immediately
    clearTenantCache(biz.subdomain);

    return NextResponse.json({ success: true, branding: updated });
  } catch (err: any) {
    console.error(`PUT /api/super-admin/businesses/${id}/branding error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
