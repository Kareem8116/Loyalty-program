import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getRedemptionRates } from '@/lib/cashier';
import { invalidateCache } from '@/lib/redis';
import { validatePositiveNumber } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    const rates = await getRedemptionRates(businessId);
    return NextResponse.json({ success: true, rates });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, pointsPerCurrencyUnit, currencyPerPoint, pointsExpiryMonths, redemptionType, maxOfflineTransactions } = body;

    if (!businessId || pointsPerCurrencyUnit === undefined || currencyPerPoint === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const validRedemptionTypes = ['product', 'cash', 'both'];
    const finalRedemptionType = validRedemptionTypes.includes(redemptionType) ? redemptionType : 'both';

    const ppuVal = validatePositiveNumber(pointsPerCurrencyUnit, false);
    const cppVal = validatePositiveNumber(currencyPerPoint, false);

    if (!ppuVal.isValid || !cppVal.isValid) {
      return NextResponse.json(
        { success: false, error: 'Rates must be positive numbers' },
        { status: 400 }
      );
    }

    const pointsNum = ppuVal.value;
    const currencyNum = cppVal.value;

    // 14.1: Validate points expiry months (0 = no expiry, default 12)
    let expiryMonths = 12;
    if (pointsExpiryMonths !== undefined) {
      const parsed = parseInt(pointsExpiryMonths, 10);
      if (isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { success: false, error: 'Points expiry months must be 0 or greater' },
          { status: 400 }
        );
      }
      expiryMonths = parsed;
    }

    // Only Owner or Super Admin can modify redemption rates (per RULES.md & RLS)
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner'],
    });
    if (!guard.success) return guard.response;

    const { supabase: userClient } = guard.context;

    const upsertPayload: Record<string, any> = {
      business_id: businessId,
      points_per_currency_unit: pointsNum,
      currency_per_point: currencyNum,
      points_expiry_months: expiryMonths,
      redemption_type: finalRedemptionType,
      updated_at: new Date().toISOString(),
    };

    if (maxOfflineTransactions !== undefined) {
      const parsedMax = parseInt(maxOfflineTransactions, 10);
      if (!isNaN(parsedMax) && parsedMax >= 1 && parsedMax <= 200) {
        upsertPayload.max_offline_transactions = parsedMax;
      }
    }

    // Upsert redemption_rates using user client (enforces RLS)
    let { data: updated, error } = await userClient
      .from('redemption_rates')
      .upsert(upsertPayload, { onConflict: 'business_id' })
      .select()
      .single();

    if (error && error.message?.includes('max_offline_transactions')) {
      delete upsertPayload.max_offline_transactions;
      const retry = await userClient
        .from('redemption_rates')
        .upsert(upsertPayload, { onConflict: 'business_id' })
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    // Invalidate Cache
    try {
      await invalidateCache(`redemption_rates:${businessId}`);
    } catch (e) {}

    return NextResponse.json({ success: true, rates: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
