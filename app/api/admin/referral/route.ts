import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getReferralSettings, updateReferralSettings } from '@/lib/referral';
import { getServiceSupabase } from '@/lib/supabase';
import { assertFeatureEnabled } from '@/lib/features';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required businessId parameter' },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'referral_program');
    if (featErr) return featErr;

    const settings = await getReferralSettings(businessId);

    // Fetch referral statistics for this business
    const adminClient = getServiceSupabase();
    const { count: totalReferrals } = await adminClient
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('referred_by', 'is', null);

    const { data: referralLedger } = await adminClient
      .from('points_ledger')
      .select('points_change')
      .eq('business_id', businessId)
      .eq('reason', 'referral');

    const totalPointsAwarded = (referralLedger || []).reduce(
      (sum, row) => sum + (row.points_change || 0),
      0
    );

    return NextResponse.json({
      success: true,
      settings,
      stats: {
        totalReferrals: totalReferrals || 0,
        totalPointsAwarded,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/referral:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, referrerRewardPoints, refereeRewardPoints } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required businessId parameter' },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const featErr = await assertFeatureEnabled(businessId, 'referral_program');
    if (featErr) return featErr;

    const updated = await updateReferralSettings(businessId, {
      referrerRewardPoints: Number(referrerRewardPoints) || 0,
      refereeRewardPoints: Number(refereeRewardPoints) || 0,
    });

    return NextResponse.json({
      success: true,
      settings: updated,
    });
  } catch (error: any) {
    console.error('Error in PUT /api/admin/referral:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
