/**
 * Phase 11.3 — Queue Status API
 *
 * GET /api/cron/queue-status
 *
 * Returns current queue depth and DLQ size.
 * Used by admin dashboard for monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueueStats } from '@/lib/points-queue';
import { getRedisCacheInfo } from '@/lib/menu-cache';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [queueStats, cacheInfo] = await Promise.all([
      getQueueStats(),
      getRedisCacheInfo(),
    ]);

    return NextResponse.json({
      success: true,
      queue: queueStats,
      cache: cacheInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
