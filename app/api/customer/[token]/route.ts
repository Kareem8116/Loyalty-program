import { NextRequest, NextResponse } from 'next/server';
import { getCustomerByQrToken } from '@/lib/customer';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { validateName, validateEgyptianPhone } from '@/lib/validation';

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

    // 2. IP-based Rate Limiting (prevents brute-force / enumeration attacks)
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`qr_token:${clientIp}`, 30, 60 * 1000); // 30 requests per minute

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

    // 3. Determine requester role from Authorization header if present
    let requesterRole: string | null = null;
    const authHeader = request.headers.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwtToken = authHeader.replace('Bearer ', '');
      const adminClient = getServiceSupabase();
      const { data: { user }, error: userError } = await adminClient.auth.getUser(jwtToken);

      if (!userError && user) {
        const { data: roleData } = await adminClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        requesterRole = roleData?.role || null;
      }
    }

    // Also check query param ?role= for server-side / test calls if needed
    const queryRole = request.nextUrl.searchParams.get('requesterRole');
    if (queryRole && !requesterRole) {
      requesterRole = queryRole;
    }

    const customer = await getCustomerByQrToken(token.trim(), requesterRole);

    if (!customer) {
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
        customer,
      },
      {
        headers: {
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error('API /api/customer/[token] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const { name, phoneNumber, notificationsEnabled } = body;

    if (!token || !TOKEN_REGEX.test(token.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR token format' },
        { status: 400 }
      );
    }

    // Rate limiting for customer profile updates
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`qr_update:${clientIp}`, 10, 60 * 1000); // 10 updates per minute

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const adminClient = getServiceSupabase();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      const nameVal = validateName(name);
      if (!nameVal.isValid) {
        return NextResponse.json(
          { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
          { status: 400 }
        );
      }
      updatePayload.name = nameVal.value;
    }

    if (phoneNumber !== undefined && String(phoneNumber).trim() !== '') {
      const phoneVal = validateEgyptianPhone(String(phoneNumber));
      if (!phoneVal.isValid) {
        return NextResponse.json(
          { success: false, error: phoneVal.errorMessage, errorKey: phoneVal.errorKey },
          { status: 400 }
        );
      }
      updatePayload.phone_number = phoneVal.cleanPhone;
    }

    if (notificationsEnabled !== undefined) {
      updatePayload.notifications_enabled = Boolean(notificationsEnabled);
    }

    if (body.notificationChannel !== undefined) {
      const validChannels = ['all', 'whatsapp', 'sms', 'none'];
      if (validChannels.includes(body.notificationChannel)) {
        updatePayload.notification_channel = body.notificationChannel;
      }
    }

    let { data: updated, error } = await adminClient
      .from('customers')
      .update(updatePayload)
      .eq('qr_token', token.trim())
      .select('id, name, phone_number, qr_token, notifications_enabled')
      .single();

    if (error && error.message?.includes('notification_channel')) {
      // Graceful fallback if migration not yet applied in Supabase
      delete updatePayload.notification_channel;
      const retryResult = await adminClient
        .from('customers')
        .update(updatePayload)
        .eq('qr_token', token.trim())
        .select('id, name, phone_number, qr_token, notifications_enabled')
        .single();
      updated = retryResult.data;
      error = retryResult.error;
    }

    if (error || !updated) {
      throw error || new Error('Customer update failed');
    }

    return NextResponse.json({
      success: true,
      customer: updated,
    });
  } catch (error: any) {
    console.error('API PUT /api/customer/[token] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    if (!token || !TOKEN_REGEX.test(token.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR token' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    const { data: customer, error: findError } = await adminClient
      .from('customers')
      .select('id, business_id')
      .eq('qr_token', token.trim())
      .maybeSingle();

    if (findError || !customer) {
      return NextResponse.json(
        { success: false, error: 'Customer card not found' },
        { status: 404 }
      );
    }

    // Delete customer (cascades points_ledger and customer_auth_links)
    const { error: delError } = await adminClient
      .from('customers')
      .delete()
      .eq('id', customer.id);

    if (delError) {
      throw delError;
    }

    return NextResponse.json({
      success: true,
      message: 'Customer loyalty card deleted successfully',
    });
  } catch (error: any) {
    console.error('API DELETE /api/customer/[token] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

