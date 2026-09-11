import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getBusinessFeaturesWithDefs } from '@/lib/features';

/**
 * GET /api/admin/features
 * Returns the enabled features map for the authenticated tenant.
 * Used by Admin dashboard to conditionally render tabs and UI sections.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryBusinessId = searchParams.get('businessId');

    const guard = await requireAuthenticatedTenant(request, {
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
      targetBusinessId: queryBusinessId,
    });

    if (!guard.success) {
      return guard.response;
    }

    const businessId = (guard.context.role === 'super_admin' && queryBusinessId)
      ? queryBusinessId
      : guard.context.businessId;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const featuresData = await getBusinessFeaturesWithDefs(businessId);

    return NextResponse.json({
      success: true,
      features: featuresData.features,
    });
  } catch (error: any) {
    console.error('GET /api/admin/features error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
