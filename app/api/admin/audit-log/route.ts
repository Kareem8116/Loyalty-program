import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';

/**
 * 15.1: GET /api/admin/audit-log
 * Returns the audit log for the authenticated user's business.
 * Supports optional query params:
 *   - cashier_id: filter by specific cashier UUID
 *   - from_date: ISO date string (e.g. 2026-09-01)
 *   - to_date: ISO date string (e.g. 2026-09-30)
 *   - limit: max records (default 100, max 500)
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAuthenticatedTenant(request, {
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { businessId, role } = guard.context;
    const adminClient = getServiceSupabase();

    const { searchParams } = new URL(request.url);
    const cashierIdFilter = searchParams.get('cashier_id');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const limitParam = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    // Build query — super_admin can query by businessId param, others use their own
    const targetBusinessId = role === 'super_admin'
      ? (searchParams.get('business_id') || businessId)
      : businessId;

    if (!targetBusinessId) {
      return NextResponse.json(
        { success: false, error: 'Business ID is required' },
        { status: 400 }
      );
    }

    let query = adminClient
      .from('audit_log')
      .select(`
        id,
        action,
        points_change,
        reason,
        status,
        error_message,
        created_at,
        cashier_id,
        customer_id,
        customers (name, phone_number)
      `)
      .eq('business_id', targetBusinessId)
      .order('created_at', { ascending: false })
      .limit(limitParam);

    if (cashierIdFilter) {
      query = query.eq('cashier_id', cashierIdFilter);
    }
    if (fromDate) {
      query = query.gte('created_at', `${fromDate}T00:00:00.000Z`);
    }
    if (toDate) {
      query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('audit_log GET error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit log' },
        { status: 500 }
      );
    }

    // Build cashier role map via user_roles lookup (separate query, no FK join)
    const cashierIds = [...new Set((data || []).map((r: any) => r.cashier_id))];
    let cashierMap: Record<string, string> = {};
    if (cashierIds.length > 0) {
      const { data: rolesData } = await adminClient
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', cashierIds)
        .eq('business_id', targetBusinessId);

      (rolesData || []).forEach((r: any) => {
        cashierMap[r.user_id] = r.role;
      });
    }


    const enriched = (data || []).map((row: any) => ({
      id: row.id,
      action: row.action,
      pointsChange: row.points_change,
      reason: row.reason,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      cashierId: row.cashier_id,
      cashierRole: cashierMap[row.cashier_id] || 'cashier',
      customerId: row.customer_id,
      customerName: row.customers?.name || null,
      customerPhone: row.customers?.phone_number || null,
    }));

    return NextResponse.json({ success: true, logs: enriched });
  } catch (err: any) {
    console.error('GET /api/admin/audit-log error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
