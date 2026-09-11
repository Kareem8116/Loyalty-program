import { NextRequest, NextResponse } from 'next/server';
import { getCustomerHistoryByToken } from '@/lib/history';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Strict token regex: allows 9-character alphanumeric codes or legacy 36-character UUIDs
const TOKEN_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-zA-Z0-9]{9})$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing QR token parameter' },
        { status: 400 }
      );
    }

    // 1. Token Format Validation (accepts 9-char alphanumeric code or UUID)
    if (!TOKEN_REGEX.test(token.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR token format' },
        { status: 400 }
      );
    }

    // 2. IP-based Rate Limiting (30 requests/min)
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`customer_history:${clientIp}`, 30, 60 * 1000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // Parse optional limit query parameter
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;

    const historyData = await getCustomerHistoryByToken(token.trim(), limit);

    if (!historyData) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        {
          status: 404,
          headers: {
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        customerId: historyData.customerId,
        businessId: historyData.businessId,
        transactions: historyData.transactions,
      },
      {
        headers: {
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error('Error in /api/customer/[token]/history:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
