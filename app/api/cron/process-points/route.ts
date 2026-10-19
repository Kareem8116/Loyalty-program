/**
 * Phase 11.3 — Queue Worker API Route
 *
 * POST /api/cron/process-points
 *
 * Called by:
 *  - Vercel Cron (every minute, via vercel.json)
 *  - Upstash QStash (if configured)
 *  - Manual trigger (for testing)
 *
 * Security: Protected by CRON_SECRET header.
 *
 * Processing: Dequeues pending points jobs from pq:pending Redis list
 * and executes them via the atomic Postgres stored procedure.
 * Failed jobs are retried up to MAX_RETRY_ATTEMPTS, then moved to DLQ.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processPendingJobs, getQueueStats, type PointsJob } from '@/lib/points-queue';
import { getServiceSupabase } from '@/lib/supabase';

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode — no secret set

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Job Processor ────────────────────────────────────────────────────────────
/**
 * Execute a single points job against the DB.
 * Calls the Postgres atomic procedure (Phase 4.5) to ensure correctness.
 */
async function executePointsJob(job: PointsJob): Promise<{
  success: boolean;
  newBalance?: number;
  error?: string;
}> {
  const adminClient = getServiceSupabase();

  try {
    // 1. Try atomic Postgres RPC first if installed
    const { data, error } = await adminClient.rpc('process_points_transaction', {
      p_business_id: job.businessId,
      p_branch_id: job.branchId,
      p_customer_id: job.customerId,
      p_points_change: job.pointsChange,
      p_reason: job.reason,
      p_created_by: job.createdBy,
      p_idempotency_key: job.idempotencyKey,
      p_expires_at: job.expiresAt || null,
      p_invoice_reference: job.invoiceReference || null,
    });

    if (!error) {
      const result = data as { success: boolean; new_balance?: number; error_code?: string; message?: string } | null;
      if (result && result.success) {
        return { success: true, newBalance: result.new_balance };
      }
      if (result && !result.success) {
        return { success: false, error: result.message || result.error_code || 'RPC failed' };
      }
    }

    // 2. Fallback to TypeScript recordPointsTransaction implementation
    const { recordPointsTransaction } = await import('@/lib/cashier');
    const result = await recordPointsTransaction({
      businessId: job.businessId,
      branchId: job.branchId,
      customerId: job.customerId,
      pointsChange: job.pointsChange,
      reason: job.reason,
      createdBy: job.createdBy,
      expiresAt: job.expiresAt || null,
      invoiceReference: job.invoiceReference || null,
      asyncQueue: false,
    });

    return { success: true, newBalance: result.newBalance };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[queue-worker] Unexpected error for job ${job.jobId}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Get queue stats before processing
    const statsBefore = await getQueueStats();

    // Process up to 50 jobs per invocation (Vercel limit: 10s timeout on Hobby plan)
    const processed = await processPendingJobs(executePointsJob, 50);

    // Get stats after processing
    const statsAfter = await getQueueStats();
    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      processed,
      elapsed_ms: elapsed,
      queue: {
        pending_before: statsBefore.pendingCount,
        pending_after: statsAfter.pendingCount,
        dlq_size: statsAfter.dlqCount,
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[queue-worker] Fatal error:', errMsg);
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}

// Support GET for Vercel Cron (which uses GET requests)
export async function GET(request: NextRequest) {
  return POST(request);
}
