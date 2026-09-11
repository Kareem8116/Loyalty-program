import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { getCustomerPointsBalance } from '@/lib/customer';
import { notifyPointsRedeemed } from '@/lib/notifications';

/**
 * 14.3: Scheduled job to process expired points.
 * Runs daily or on-demand to identify points that have passed expires_at
 * and record corresponding deduction entries in points_ledger.
 */
export async function GET(request: NextRequest) {
  return handleExpirePoints(request);
}

export async function POST(request: NextRequest) {
  return handleExpirePoints(request);
}

async function handleExpirePoints(request: NextRequest) {
  // Optional security check for CRON_SECRET if configured
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminClient = getServiceSupabase();
    const nowIso = new Date().toISOString();

    // 1. Fetch positive ledger records whose expires_at is in the past
    const { data: expiredRecords, error: fetchErr } = await adminClient
      .from('points_ledger')
      .select('id, business_id, branch_id, customer_id, points_change, expires_at')
      .gt('points_change', 0)
      .not('expires_at', 'is', null)
      .lte('expires_at', nowIso);

    if (fetchErr) {
      throw new Error(`Failed to query expired points: ${fetchErr.message}`);
    }

    if (!expiredRecords || expiredRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired points to process',
        processed: 0,
        totalPointsDeducted: 0,
      });
    }

    let processedCount = 0;
    let totalPointsDeducted = 0;

    for (const record of expiredRecords) {
      const expiryReason = `expired:${record.id}`;

      // 2. Idempotency check: Ensure this exact record has not already been expired
      const { data: existingDeduction } = await adminClient
        .from('points_ledger')
        .select('id')
        .eq('customer_id', record.customer_id)
        .eq('reason', expiryReason)
        .maybeSingle();

      if (existingDeduction) {
        // Already processed
        continue;
      }

      // 3. Check customer's current balance to prevent negative balance
      const currentBalance = await getCustomerPointsBalance(record.customer_id);
      if (currentBalance <= 0) {
        // Mark as processed with 0 points deducted if balance is already exhausted
        await adminClient.from('points_ledger').insert({
          business_id: record.business_id,
          branch_id: record.branch_id || null,
          customer_id: record.customer_id,
          points_change: 0,
          reason: expiryReason,
        });
        continue;
      }

      // Deduct up to the remaining customer balance
      const deductPoints = Math.min(record.points_change, currentBalance);

      const { error: insertErr } = await adminClient.from('points_ledger').insert({
        business_id: record.business_id,
        branch_id: record.branch_id || null,
        customer_id: record.customer_id,
        points_change: -deductPoints,
        reason: expiryReason,
      });

      if (insertErr) {
        console.error(`Failed to record expiry deduction for record ${record.id}:`, insertErr);
        continue;
      }

      // 16.7: Notify customer about expired points (fail-silent)
      notifyPointsRedeemed(record.business_id, record.customer_id, deductPoints, currentBalance - deductPoints);

      processedCount++;
      totalPointsDeducted += deductPoints;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${processedCount} expired point record(s)`,
      processed: processedCount,
      totalPointsDeducted,
    });
  } catch (error: any) {
    console.error('Error in cron/expire-points:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
