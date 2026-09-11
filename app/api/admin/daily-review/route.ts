import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { detectAnomalies } from '@/lib/anomaly-detection';

/**
 * 15.14: Owner Daily Review API
 * 
 * GET /api/admin/daily-review
 * Query parameters:
 *   - date: ISO date string (YYYY-MM-DD), default is today
 *   - cashier_id: optional filter by cashier
 *   - flagged_only: 'true' | 'false'
 * 
 * PATCH /api/admin/daily-review
 * Body:
 *   - transactionId: string
 *   - flagged: boolean
 *   - flagReason?: string
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
    const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const cashierIdFilter = searchParams.get('cashier_id');
    const flaggedOnly = searchParams.get('flagged_only') === 'true';

    const targetBusinessId = role === 'super_admin'
      ? (searchParams.get('business_id') || businessId)
      : businessId;

    if (!targetBusinessId) {
      return NextResponse.json({ success: false, error: 'Business ID is required' }, { status: 400 });
    }

    const startDate = `${dateParam}T00:00:00.000Z`;
    const endDate = `${dateParam}T23:59:59.999Z`;

    let query = adminClient
      .from('points_ledger')
      .select(`
        id,
        business_id,
        branch_id,
        customer_id,
        points_change,
        reason,
        created_by,
        created_at,
        expires_at,
        invoice_reference,
        flagged_by_owner,
        flag_reason,
        reversal_of,
        customers (id, name, phone_number)
      `)
      .eq('business_id', targetBusinessId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (cashierIdFilter) {
      query = query.eq('created_by', cashierIdFilter);
    }
    if (flaggedOnly) {
      query = query.eq('flagged_by_owner', true);
    }

    let { data: rows, error } = await query;
    if (error && error.message?.includes('reversal_of')) {
      // Fallback if reversal_of column not yet created
      const fallbackQuery = adminClient
        .from('points_ledger')
        .select(`
          id,
          business_id,
          branch_id,
          customer_id,
          points_change,
          reason,
          created_by,
          created_at,
          expires_at,
          invoice_reference,
          flagged_by_owner,
          flag_reason,
          customers (id, name, phone_number)
        `)
        .eq('business_id', targetBusinessId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      const fallback = await fallbackQuery;
      rows = fallback.data as any;
      error = fallback.error;
    }

    if (error) {
      console.error('daily-review GET error:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch daily review records' }, { status: 500 });
    }

    const ledgerRows = rows || [];

    // Map unique cashier IDs to display names or role
    const cashierIds = [...new Set(ledgerRows.map((r: any) => r.created_by).filter(Boolean))];
    const cashierMap: Record<string, string> = {};

    await Promise.all(
      cashierIds.map(async (cid) => {
        try {
          const { data: userData } = await adminClient.auth.admin.getUserById(cid);
          if (userData?.user?.email) {
            cashierMap[cid] = userData.user.email.split('@')[0];
          } else {
            cashierMap[cid] = cid.slice(0, 8);
          }
        } catch {
          cashierMap[cid] = cid.slice(0, 8);
        }
      })
    );

    // Calculate Summary Metrics
    let totalPointsIssued = 0;
    let totalPointsRedeemed = 0;
    let flaggedCount = 0;

    // Identify reversed IDs
    const reversedIds = new Set<string>();
    ledgerRows.forEach((r: any) => {
      if (r.reversal_of) reversedIds.add(r.reversal_of);
      if (typeof r.reason === 'string') {
        const match = r.reason.match(/\[REV:([a-f0-9-]+)\]/i);
        if (match && match[1]) reversedIds.add(match[1]);
      }
    });

    const formattedTransactions = ledgerRows.map((row: any) => {
      const rawReason = row.reason || '';
      const cleanReason = rawReason
        .replace(/\[REV:[^\]]+\]/g, '')
        .replace(/\[CBD:[^\]]+\]/g, '')
        .trim();
      const change = Number(row.points_change) || 0;
      if (change > 0) {
        totalPointsIssued += change;
      } else if (change < 0 && cleanReason !== 'expired') {
        totalPointsRedeemed += Math.abs(change);
      }

      const isFlagged = Boolean(row.flagged_by_owner);
      if (isFlagged) {
        flaggedCount++;
      }

      let type: 'earn' | 'redeem' | 'expired' | 'reversal' = 'earn';
      if (cleanReason === 'expired') {
        type = 'expired';
      } else if (row.reversal_of || cleanReason.startsWith('استرجاع') || cleanReason.startsWith('إلغاء')) {
        type = 'reversal';
      } else if (change < 0) {
        type = 'redeem';
      }

      return {
        id: row.id,
        pointsChange: change,
        type,
        reason: cleanReason,
        invoiceReference: row.invoice_reference || null,
        flaggedByOwner: isFlagged,
        flagReason: row.flag_reason || null,
        reversalOf: row.reversal_of || null,
        isReversed: reversedIds.has(row.id),
        createdAt: row.created_at,
        customer: row.customers ? {
          id: row.customers.id,
          name: row.customers.name,
          phoneNumber: row.customers.phone_number,
        } : null,
        cashier: {
          id: row.created_by,
          name: cashierMap[row.created_by] || 'النظام',
        },
      };
    });

    // Phase 31: Run smart anomaly detection (Fail-silent, non-blocking)
    let anomalies: any[] = [];
    try {
      anomalies = await detectAnomalies(targetBusinessId, formattedTransactions);
    } catch (anomErr) {
      console.warn('detectAnomalies non-blocking error:', anomErr);
    }

    return NextResponse.json({
      success: true,
      date: dateParam,
      summary: {
        totalPointsIssued,
        totalPointsRedeemed,
        totalTransactions: formattedTransactions.length,
        flaggedCount,
        anomaliesCount: anomalies.length,
      },
      transactions: formattedTransactions,
      anomalies,
    });
  } catch (error: any) {
    console.error('API /api/admin/daily-review GET error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAuthenticatedTenant(request, {
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { businessId, role } = guard.context;
    const body = await request.json();
    const { transactionId, flagged, flagReason } = body;

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required' }, { status: 400 });
    }

    const adminClient = getServiceSupabase();

    // Verify transaction belongs to business
    const { data: existingRow, error: findErr } = await adminClient
      .from('points_ledger')
      .select('id, business_id')
      .eq('id', transactionId)
      .maybeSingle();

    if (findErr || !existingRow) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    if (role !== 'super_admin' && existingRow.business_id !== businessId) {
      return NextResponse.json({ success: false, error: 'Unauthorized to update this transaction' }, { status: 403 });
    }

    const { data: updated, error: updateErr } = await adminClient
      .from('points_ledger')
      .update({
        flagged_by_owner: Boolean(flagged),
        flag_reason: flagged ? (flagReason || 'تم وضع علامة للمراجعة من قبل الإدارة') : null,
      })
      .eq('id', transactionId)
      .select('id, flagged_by_owner, flag_reason')
      .single();

    if (updateErr) {
      console.error('Failed to update flagged status:', updateErr);
      return NextResponse.json({ success: false, error: 'Failed to update transaction flag' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      transaction: updated,
    });
  } catch (error: any) {
    console.error('API /api/admin/daily-review PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal error' }, { status: 500 });
  }
}
