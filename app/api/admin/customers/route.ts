import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { createCustomer, getCustomerPointsBalance } from '@/lib/customer';
import { validateName, validateEgyptianPhone } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    // Central Tenant & Auth Guard: Verifies JWT, ensures user belongs to business, and returns RLS-scoped client
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { supabase: userClient } = guard.context;
    const { data: customers, error } = await userClient
      .from('customers')
      .select('id, name, phone_number, qr_token, referral_code, consent_given_at, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate points balance for each customer
    const customersWithPoints = await Promise.all(
      (customers || []).map(async (c) => {
        const points = await getCustomerPointsBalance(c.id);
        return { ...c, points_balance: points };
      })
    );

    return NextResponse.json({ success: true, customers: customersWithPoints });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, name, phoneNumber, consentGiven, referralCode } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: businessId' },
        { status: 400 }
      );
    }

    // Phase 33: Centralized input validation
    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    const phoneVal = validateEgyptianPhone(phoneNumber);
    if (!phoneVal.isValid) {
      return NextResponse.json(
        { success: false, error: phoneVal.errorMessage, errorKey: phoneVal.errorKey },
        { status: 400 }
      );
    }

    // 13.3 & 13.4: Mandatory customer consent verification
    if (!consentGiven) {
      return NextResponse.json(
        { success: false, error: 'Customer consent is mandatory for registration' },
        { status: 400 }
      );
    }

    // Central Tenant & Auth Guard: ensures user is owner/branch_admin for this business
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    // 5.3, 13.3 & 19.4: Add new customer with auto-generated qr_token (UUID), consent, and referral reward
    const customer = await createCustomer({
      businessId,
      name: nameVal.value,
      phoneNumber: phoneVal.cleanPhone,
      consentGiven: Boolean(consentGiven),
      referralCode: referralCode?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      customer: {
        ...customer,
        points_balance: 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
