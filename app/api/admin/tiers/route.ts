import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { assertFeatureEnabled } from '@/lib/features';
import {
  getBusinessTiers,
  createBusinessTier,
  updateBusinessTier,
  deleteBusinessTier,
} from '@/lib/tiers';

/**
 * GET /api/admin/tiers?businessId=...
 * List all membership tiers for a business ordered by min_points_earned ASC
 */
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get('businessId');
    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId parameter' }, { status: 400 });
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'membership_tiers');
    if (featErr) return featErr;

    const tiers = await getBusinessTiers(businessId);

    return NextResponse.json({
      success: true,
      tiers,
    });
  } catch (error: any) {
    console.error('GET /api/admin/tiers error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/tiers
 * Create a new membership tier
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, name, minPointsEarned, benefitsDescription } = body;

    if (!businessId || !name || name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: businessId and name' },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'membership_tiers');
    if (featErr) return featErr;

    const tier = await createBusinessTier({
      businessId,
      name: name.trim(),
      minPointsEarned: Number(minPointsEarned) || 0,
      benefitsDescription,
    });

    return NextResponse.json({
      success: true,
      tier,
    });
  } catch (error: any) {
    console.error('POST /api/admin/tiers error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 400 });
  }
}

/**
 * PUT /api/admin/tiers
 * Update an existing membership tier
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, tierId, name, minPointsEarned, benefitsDescription } = body;

    if (!businessId || !tierId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: businessId and tierId' },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'membership_tiers');
    if (featErr) return featErr;

    const updated = await updateBusinessTier(tierId, businessId, {
      name,
      minPointsEarned: minPointsEarned !== undefined ? Number(minPointsEarned) : undefined,
      benefitsDescription,
    });

    return NextResponse.json({
      success: true,
      tier: updated,
    });
  } catch (error: any) {
    console.error('PUT /api/admin/tiers error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 400 });
  }
}

/**
 * DELETE /api/admin/tiers
 * Delete a membership tier
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, tierId } = body;

    if (!businessId || !tierId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: businessId and tierId' },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'membership_tiers');
    if (featErr) return featErr;

    await deleteBusinessTier(tierId, businessId);

    return NextResponse.json({
      success: true,
      deletedId: tierId,
    });
  } catch (error: any) {
    console.error('DELETE /api/admin/tiers error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
