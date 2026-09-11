import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getOwnerAnalytics, AnalyticsTimeframe } from '@/lib/analytics';
import { assertFeatureEnabled } from '@/lib/features';

const VALID_TIMEFRAMES: AnalyticsTimeframe[] = ['7d', '30d', '90d', 'all'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const rawTimeframe = searchParams.get('timeframe') || '30d';

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required businessId parameter' },
        { status: 400 }
      );
    }

    const timeframe: AnalyticsTimeframe = VALID_TIMEFRAMES.includes(rawTimeframe as AnalyticsTimeframe)
      ? (rawTimeframe as AnalyticsTimeframe)
      : '30d';

    // Verify tenant membership & roles
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'analytics_reports');
    if (featErr) return featErr;

    const analytics = await getOwnerAnalytics(businessId, timeframe);

    return NextResponse.json({
      success: true,
      analytics,
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/analytics:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
