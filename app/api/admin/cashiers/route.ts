import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { getCashierDailyStats } from '@/lib/cashier';
import { 
  validateEgyptianPhone, 
  validatePassword, 
  validateEmail, 
  validateName, 
  validatePositiveNumber 
} from '@/lib/validation';

/**
 * 15.2: GET /api/admin/cashiers
 * Returns all cashiers for the business with their daily_points_limit,
 * per_transaction_points_limit, today's activity stats, and user profile details.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAuthenticatedTenant(request, {
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { businessId: userBizId, role } = guard.context;
    const adminClient = getServiceSupabase();

    const { searchParams } = new URL(request.url);
    const targetBusinessId = role === 'super_admin'
      ? (searchParams.get('business_id') || userBizId)
      : userBizId;

    if (!targetBusinessId) {
      return NextResponse.json(
        { success: false, error: 'Business ID is required' },
        { status: 400 }
      );
    }

    // Fetch all cashiers for this business (select * to safely handle optional/new columns)
    const { data: cashiers, error } = await adminClient
      .from('user_roles')
      .select('*, branches (name)')
      .eq('business_id', targetBusinessId)
      .eq('role', 'cashier')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch cashiers' },
        { status: 500 }
      );
    }

    // Enrich with user profile info from auth
    const userMap = new Map<string, { email?: string; fullName?: string; phone?: string }>();
    try {
      const userIds = (cashiers || []).map((c: any) => c.user_id);
      await Promise.all(
        userIds.map(async (uId: string) => {
          try {
            const { data: uData } = await adminClient.auth.admin.getUserById(uId);
            if (uData?.user) {
              userMap.set(uId, {
                email: uData.user.email,
                fullName: uData.user.user_metadata?.full_name || uData.user.email?.split('@')[0],
                phone: uData.user.user_metadata?.phone || uData.user.phone,
              });
            }
          } catch {
            // ignore individual user fetch errors
          }
        })
      );
    } catch (e) {
      console.warn('Could not enrich cashier user details:', e);
    }

    // Fetch today's stats for each cashier in parallel
    const enriched = await Promise.all(
      (cashiers || []).map(async (c: any) => {
        const { pointsAddedToday } = await getCashierDailyStats(c.user_id, targetBusinessId);
        const limit = c.daily_points_limit ?? 1000;
        const txLimit = c.per_transaction_points_limit ?? null;
        const usagePercent = limit > 0 ? Math.round((pointsAddedToday / limit) * 100) : 0;
        const uInfo = userMap.get(c.user_id) || {};

        return {
          roleId: c.id,
          userId: c.user_id,
          branchId: c.branch_id,
          branchName: c.branches?.name || null,
          email: uInfo.email || null,
          fullName: uInfo.fullName || null,
          phoneNumber: uInfo.phone || null,
          dailyPointsLimit: limit,
          perTransactionPointsLimit: txLimit,
          pointsAddedToday,
          usagePercent,
          // 15.4: Flag cashiers near or over their daily limit
          isNearLimit: limit > 0 && usagePercent >= 80,
          isOverLimit: limit > 0 && usagePercent >= 100,
        };
      })
    );

    return NextResponse.json({ success: true, cashiers: enriched });
  } catch (err: any) {
    console.error('GET /api/admin/cashiers error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/cashiers
 * Create a new cashier account for the business with email, password, full name,
 * optional phone, branch assignment, daily limit, and per-transaction limit.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAuthenticatedTenant(request, {
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { businessId: userBizId, role } = guard.context;
    const body = await request.json();
    const {
      email,
      password,
      fullName,
      phoneNumber,
      branchId,
      dailyPointsLimit,
      perTransactionPointsLimit,
      businessId: customBizId,
    } = body;

    const targetBusinessId = role === 'super_admin'
      ? (customBizId || userBizId)
      : userBizId;

    if (!targetBusinessId) {
      return NextResponse.json(
        { success: false, error: 'Business ID is required' },
        { status: 400 }
      );
    }

    // Validate email
    const emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      return NextResponse.json(
        { success: false, error: emailVal.errorMessage, errorKey: emailVal.errorKey },
        { status: 400 }
      );
    }

    // Validate full name
    const nameVal = validateName(fullName);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    // Validate phone number if provided (Egyptian rules)
    let cleanPhone: string | undefined = undefined;
    if (phoneNumber && String(phoneNumber).trim()) {
      const phoneValidation = validateEgyptianPhone(String(phoneNumber));
      if (!phoneValidation.isValid) {
        return NextResponse.json(
          { success: false, error: phoneValidation.errorMessage, errorKey: phoneValidation.errorKey },
          { status: 400 }
        );
      }
      cleanPhone = phoneValidation.cleanPhone;
    }

    // Validate password
    const pwValidation = validatePassword(password);
    if (!pwValidation.isValid) {
      return NextResponse.json(
        { success: false, error: pwValidation.errorMessage, errorKey: pwValidation.errorKey },
        { status: 400 }
      );
    }

    // Validate limits
    let dailyLimitNum = 1000;
    if (dailyPointsLimit !== undefined && dailyPointsLimit !== '') {
      const dailyVal = validatePositiveNumber(dailyPointsLimit, true);
      if (!dailyVal.isValid) {
        return NextResponse.json(
          { success: false, error: dailyVal.errorMessage, errorKey: dailyVal.errorKey },
          { status: 400 }
        );
      }
      dailyLimitNum = dailyVal.value;
    }

    let txLimitNum: number | null = null;
    if (perTransactionPointsLimit !== undefined && perTransactionPointsLimit !== null && perTransactionPointsLimit !== '') {
      const txVal = validatePositiveNumber(perTransactionPointsLimit, true);
      if (!txVal.isValid) {
        return NextResponse.json(
          { success: false, error: txVal.errorMessage, errorKey: txVal.errorKey },
          { status: 400 }
        );
      }
      txLimitNum = txVal.value;
    }

    const adminClient = getServiceSupabase();

    // Create user in Supabase Auth
    let userId: string;
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: nameVal.value,
        phone: cleanPhone || undefined,
      },
    });

    if (createError) {
      if (createError.message.includes('already registered') || createError.message.includes('already exists')) {
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const existing = listData?.users?.find(
          (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
        );
        if (!existing) {
          return NextResponse.json({ success: false, error: createError.message }, { status: 400 });
        }
        userId = existing.id;
      } else {
        return NextResponse.json({ success: false, error: createError.message }, { status: 400 });
      }
    } else {
      userId = createData.user.id;
    }

    // Check if this user already has a role in this business
    const { data: existingRole } = await adminClient
      .from('user_roles')
      .select('id, role')
      .eq('user_id', userId)
      .eq('business_id', targetBusinessId)
      .maybeSingle();

    if (existingRole) {
      return NextResponse.json(
        {
          success: false,
          error: `هذا المستخدم مسجل بالفعل في هذا المتجر بصلاحية (${existingRole.role})`,
        },
        { status: 400 }
      );
    }

    // Insert user_roles record
    const roleInsertPayload: any = {
      business_id: targetBusinessId,
      user_id: userId,
      branch_id: branchId || null,
      role: 'cashier',
      daily_points_limit: dailyLimitNum,
    };
    if (txLimitNum !== null) {
      roleInsertPayload.per_transaction_points_limit = txLimitNum;
    }

    const { data: newRole, error: roleError } = await adminClient
      .from('user_roles')
      .insert(roleInsertPayload)
      .select('*, branches (name)')
      .single();

    if (roleError) {
      return NextResponse.json(
        { success: false, error: `فشل تعيين صلاحية الكاشير: ${roleError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'تم إنشاء حساب الكاشير بنجاح',
        cashier: {
          roleId: newRole.id,
          userId: newRole.user_id,
          branchId: newRole.branch_id,
          branchName: newRole.branches?.name || null,
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          phoneNumber: phoneNumber?.trim() || null,
          dailyPointsLimit: dailyLimitNum,
          perTransactionPointsLimit: txLimitNum,
          pointsAddedToday: 0,
          usagePercent: 0,
          isNearLimit: false,
          isOverLimit: false,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('POST /api/admin/cashiers error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 15.2: PATCH /api/admin/cashiers
 * Update daily_points_limit and/or per_transaction_points_limit for a specific cashier.
 * Body: { roleId: string, dailyPointsLimit?: number, perTransactionPointsLimit?: number | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAuthenticatedTenant(request, {
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { businessId: userBizId, role } = guard.context;
    const body = await request.json();
    const { roleId, dailyPointsLimit, perTransactionPointsLimit } = body;

    if (!roleId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: roleId' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Validate the role record belongs to this business
    const { data: roleRecord, error: fetchError } = await adminClient
      .from('user_roles')
      .select('id, business_id, role')
      .eq('id', roleId)
      .maybeSingle();

    if (fetchError || !roleRecord) {
      return NextResponse.json(
        { success: false, error: 'Cashier role record not found' },
        { status: 404 }
      );
    }

    if (role !== 'super_admin' && roleRecord.business_id !== userBizId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cannot modify cashiers from another business' },
        { status: 403 }
      );
    }

    if (roleRecord.role !== 'cashier') {
      return NextResponse.json(
        { success: false, error: 'Limits can only be set on cashier roles' },
        { status: 400 }
      );
    }

    const updatePayload: any = { updated_at: new Date().toISOString() };

    if (dailyPointsLimit !== undefined) {
      const limitNum = parseInt(String(dailyPointsLimit), 10);
      if (isNaN(limitNum) || limitNum < 0) {
        return NextResponse.json(
          { success: false, error: 'dailyPointsLimit must be a non-negative integer (0 = no limit)' },
          { status: 400 }
        );
      }
      updatePayload.daily_points_limit = limitNum;
    }

    if (perTransactionPointsLimit !== undefined) {
      if (perTransactionPointsLimit === null || perTransactionPointsLimit === '' || perTransactionPointsLimit === 0) {
        updatePayload.per_transaction_points_limit = null;
      } else {
        const txLimitNum = parseInt(String(perTransactionPointsLimit), 10);
        if (isNaN(txLimitNum) || txLimitNum < 0) {
          return NextResponse.json(
            { success: false, error: 'perTransactionPointsLimit must be a non-negative integer or null' },
            { status: 400 }
          );
        }
        updatePayload.per_transaction_points_limit = txLimitNum;
      }
    }

    const { error: updateError } = await adminClient
      .from('user_roles')
      .update(updatePayload)
      .eq('id', roleId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: `Failed to update limits: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Cashier limits updated successfully for role ${roleId}`,
    });
  } catch (err: any) {
    console.error('PATCH /api/admin/cashiers error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
