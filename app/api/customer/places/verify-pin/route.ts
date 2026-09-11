import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { hashPin } from '@/lib/cashier';
import { validatePin } from '@/lib/validation';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

/**
 * Phase 27.4 & 27.5 — POST /api/customer/places/verify-pin
 * Verifies the 4-digit PIN for a customer_auth_links entry.
 * On success: returns qr_token and resets failed attempts.
 * On failure: increments failed attempts; locks after 5 consecutive fails.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { linkId, pin } = body;

    if (!linkId) {
      return NextResponse.json({ success: false, error: 'linkId is required' }, { status: 400 });
    }

    const pinVal = validatePin(pin);
    if (!pinVal.isValid) {
      return NextResponse.json({ success: false, error: pinVal.errorMessage, errorKey: pinVal.errorKey }, { status: 400 });
    }

    const adminClient = getServiceSupabase();

    // Fetch the link record — must belong to this auth user
    const { data: link, error: linkError } = await adminClient
      .from('customer_auth_links')
      .select('id, auth_user_id, customer_id, access_pin_hash, failed_pin_attempts, locked_until')
      .eq('id', linkId)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json({ success: false, error: 'Link not found' }, { status: 404 });
    }

    // 27.5: Check lock status
    const now = new Date();
    if (link.locked_until && new Date(link.locked_until) > now) {
      return NextResponse.json({
        success: false,
        error: 'LOCKED',
        lockedUntil: link.locked_until,
      }, { status: 423 });
    }

    // Verify PIN
    const hashedInput = hashPin(pin);
    const isPinCorrect = link.access_pin_hash && link.access_pin_hash === hashedInput;

    if (!isPinCorrect) {
      const newFailedAttempts = (link.failed_pin_attempts || 0) + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString()
        : null;

      await adminClient
        .from('customer_auth_links')
        .update({
          failed_pin_attempts: newFailedAttempts,
          locked_until: lockedUntil,
        })
        .eq('id', linkId);

      return NextResponse.json({
        success: false,
        error: shouldLock ? 'LOCKED' : 'WRONG_PIN',
        remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - newFailedAttempts),
        lockedUntil,
      }, { status: 401 });
    }

    // PIN correct — reset failed attempts and fetch customer data
    await adminClient
      .from('customer_auth_links')
      .update({
        failed_pin_attempts: 0,
        locked_until: null,
      })
      .eq('id', linkId);

    // Now it's safe to return qr_token and points balance
    const { data: customer, error: custError } = await adminClient
      .from('customers')
      .select('id, name, phone_number, qr_token, business_id')
      .eq('id', link.customer_id)
      .maybeSingle();

    if (custError || !customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const { getCustomerPointsBalance } = await import('@/lib/customer');
    const pointsBalance = await getCustomerPointsBalance(customer.id, customer.business_id);

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phoneNumber: customer.phone_number,
        qrToken: customer.qr_token,
        pointsBalance,
      },
    });
  } catch (err: any) {
    console.error('verify-pin error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
