import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { reversePointsTransaction } from '@/lib/cashier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, transactionId, reason } = body;

    if (!businessId || !transactionId) {
      return NextResponse.json(
        { success: false, error: 'المعاملات المطلوبة ناقصة: businessId و transactionId إلزاميان' },
        { status: 400 }
      );
    }

    // Authenticate tenant and ensure role is cashier, branch_admin, owner, or super_admin
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    const { userId, role, branchId } = guard.context;

    const result = await reversePointsTransaction({
      businessId,
      branchId: branchId || null,
      transactionId,
      reason: reason ? String(reason).trim() : 'استرجاع عملية',
      userId,
      userRole: role,
    });

    return NextResponse.json({
      success: true,
      message: 'تم استرجاع العملية بنجاح',
      newBalance: result.newBalance,
      reversal: result.reversalRecord,
    });
  } catch (error: any) {
    console.error('API /api/cashier/reversal error:', error);

    const statusMap: Record<string, number> = {
      TRANSACTION_NOT_FOUND: 404,
      CROSS_TENANT_REVERSAL_FORBIDDEN: 403,
      CANNOT_REVERSE_REVERSAL: 400,
      ALREADY_REVERSED: 409,
      REVERSAL_WINDOW_EXPIRED: 403,
      INSUFFICIENT_BALANCE_FOR_REVERSAL: 400,
    };

    const status = (error.code && statusMap[error.code]) || 400;

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'فشل استرجاع العملية',
        errorCode: error.code || 'REVERSAL_FAILED',
      },
      { status }
    );
  }
}
