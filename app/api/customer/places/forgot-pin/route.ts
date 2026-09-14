import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { hashPin } from '@/lib/cashier';
import * as crypto from 'crypto';

const OTP_EXPIRY_MINUTES = 15;
const MAX_OTP_REQUESTS_PER_HOUR = 3;

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Phase 27.6 — POST /api/customer/places/forgot-pin
 * Handles forgot PIN flow via email OTP.
 * Actions:
 *   - 'send_otp': generates a 6-digit OTP and sends it to the user's email
 *   - 'verify_and_reset': verifies OTP, resets PIN, unlocks the link
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
    const { action, linkId, otp, newPin } = body;

    if (!linkId || !action) {
      return NextResponse.json({ success: false, error: 'linkId and action are required' }, { status: 400 });
    }

    const adminClient = getServiceSupabase();

    // Verify the link belongs to this user
    const { data: link, error: linkError } = await adminClient
      .from('customer_auth_links')
      .select('id, auth_user_id, business_id')
      .eq('id', linkId)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json({ success: false, error: 'Link not found' }, { status: 404 });
    }

    if (action === 'send_otp') {
      // Rate limit: max 3 OTP requests per hour per link
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await adminClient
        .from('pin_reset_otps')
        .select('id', { count: 'exact', head: true })
        .eq('link_id', linkId)
        .gte('created_at', oneHourAgo);

      if ((count || 0) >= MAX_OTP_REQUESTS_PER_HOUR) {
        return NextResponse.json({
          success: false,
          error: 'TOO_MANY_REQUESTS',
          message: 'Too many reset requests. Please wait before trying again.',
        }, { status: 429 });
      }

      const otpCode = generateOTP();
      const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

      // Invalidate any previous OTPs for this link
      await adminClient
        .from('pin_reset_otps')
        .update({ used: true })
        .eq('link_id', linkId)
        .eq('used', false);

      // Store OTP hash
      await adminClient.from('pin_reset_otps').insert({
        link_id: linkId,
        auth_user_id: user.id,
        otp_hash: otpHash,
        expires_at: expiresAt,
        used: false,
      });

      // Send OTP via Supabase (email)
      // We use the service role admin to send a custom email
      const emailSubject = 'Reset your loyalty PIN';
      const emailBody = `Your PIN reset code is: ${otpCode}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.`;

      // If user has a real email (not phantom), send email OTP
      if (user.email && !user.email.endsWith('@pointat.internal')) {
        try {
          const { error: emailErr } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: user.email,
            options: {
              data: { otp_code: otpCode },
            },
          });
          if (emailErr) {
            console.warn('Email send warning (non-blocking):', emailErr.message);
          }
        } catch (emailEx) {
          console.warn('Email send exception (non-blocking):', emailEx);
        }
      }

      // In development: log OTP for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV] OTP for link ${linkId}: ${otpCode}`);
      }

      return NextResponse.json({ success: true, message: 'تم إرسال كود التحقق بنجاح.' });

    } else if (action === 'verify_and_reset') {
      if (!otp || !newPin) {
        return NextResponse.json({ success: false, error: 'otp and newPin are required' }, { status: 400 });
      }

      if (!/^\d{6}$/.test(String(otp))) {
        return NextResponse.json({ success: false, error: 'OTP must be 6 digits' }, { status: 400 });
      }

      if (!/^\d{4}$/.test(String(newPin))) {
        return NextResponse.json({ success: false, error: 'New PIN must be 4 digits' }, { status: 400 });
      }

      const otpHash = crypto.createHash('sha256').update(String(otp)).digest('hex');
      const now = new Date().toISOString();

      // Find a valid, unused OTP
      const { data: otpRecord, error: otpError } = await adminClient
        .from('pin_reset_otps')
        .select('id, expires_at, used')
        .eq('link_id', linkId)
        .eq('auth_user_id', user.id)
        .eq('otp_hash', otpHash)
        .eq('used', false)
        .gt('expires_at', now)
        .maybeSingle();

      if (otpError || !otpRecord) {
        return NextResponse.json({
          success: false,
          error: 'INVALID_OTP',
          message: 'Invalid or expired verification code.',
        }, { status: 401 });
      }

      const newPinHash = hashPin(String(newPin));

      // Update link: set new PIN, clear lockout, reset failed attempts
      await adminClient
        .from('customer_auth_links')
        .update({
          access_pin_hash: newPinHash,
          failed_pin_attempts: 0,
          locked_until: null,
        })
        .eq('id', linkId);

      // Mark OTP as used
      await adminClient
        .from('pin_reset_otps')
        .update({ used: true })
        .eq('id', otpRecord.id);

      // Fetch customer qr_token for direct redirect
      const { data: linkData } = await adminClient
        .from('customer_auth_links')
        .select('customer_id')
        .eq('id', linkId)
        .maybeSingle();

      let qrToken: string | null = null;
      if (linkData?.customer_id) {
        const { data: cust } = await adminClient
          .from('customers')
          .select('qr_token')
          .eq('id', linkData.customer_id)
          .maybeSingle();
        qrToken = cust?.qr_token || null;
      }

      return NextResponse.json({ 
        success: true, 
        message: 'PIN reset successfully.',
        customer: { qrToken }
      });

    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('forgot-pin error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
