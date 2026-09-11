import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { generateCustomerRecommendation } from '@/lib/recommendations';

const TOKEN_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-zA-Z0-9]{9})$/i;

interface RouteProps {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { token } = await params;

    if (!token || !TOKEN_REGEX.test(token.trim())) {
      return NextResponse.json({ success: false, error: 'Invalid token format' }, { status: 400 });
    }

    // Rate Limiting: 30 requests per minute per IP
    const ip = getClientIp(request);
    const limit = await checkRateLimit(`rec-api:${ip}`, 30, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    // Query customer to get business_id
    const adminClient = getServiceSupabase();
    const { data: customer, error: custErr } = await adminClient
      .from('customers')
      .select('id, business_id')
      .eq('qr_token', token)
      .maybeSingle();

    if (custErr || !customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const locale = (searchParams.get('locale') === 'en' ? 'en' : 'ar') as 'ar' | 'en';

    // Generate recommendation (Fail-silent, cached 1h)
    const recommendation = await generateCustomerRecommendation({
      businessId: customer.business_id,
      customerToken: token,
      locale,
    });

    return NextResponse.json({
      success: true,
      recommendation,
    });
  } catch (err: any) {
    console.error('API /api/customer/[token]/recommendation error:', err);
    // Fail-silent response: return null recommendation without failing customer card
    return NextResponse.json({ success: true, recommendation: null });
  }
}
