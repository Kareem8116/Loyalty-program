import { NextRequest, NextResponse } from 'next/server';
import { getBranchMenuItems, getRedemptionRates } from '@/lib/cashier';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const branchId = searchParams.get('branchId');

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing businessId parameter' },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    const [menuItems, rates] = await Promise.all([
      getBranchMenuItems(businessId, branchId),
      getRedemptionRates(businessId),
    ]);

    return NextResponse.json({
      success: true,
      menuItems,
      rates,
    });
  } catch (error: any) {
    console.error('API /api/cashier/menu error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
