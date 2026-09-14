import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { generatePasswordChangeOtp } from '@/lib/otp';
import { sendSms } from '@/lib/sms';
import { validateEgyptianPhone } from '@/lib/validation';

const PHANTOM_DOMAIN = 'pointat.internal';

/**
 * Phase 23.3 — Reworked for Phone-Only Customer Auth:
 * 
 * Accepts a phone number, generates a password-change OTP in Redis,
 * and sends it via SMS. Falls back to a generic response to prevent
 * user enumeration attacks.
 * 
 * Staff (email-based) are NOT handled here; they use standard flows.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    // 1. IP Rate Limiting (5 requests per minute)
    const ipLimit = await checkRateLimit(`pwd-reset-ip:${ip}`, 5, 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'تم تجاوز الحد الأقصى للمحاولات، يرجى المحاولة بعد قليل.',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { phone } = body;

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رقم الموبايل' },
        { status: 400 }
      );
    }

    const phoneVal = validateEgyptianPhone(phone.trim());
    if (!phoneVal.isValid) {
      return NextResponse.json(
        { success: false, error: phoneVal.errorMessage || 'رقم الموبايل غير صحيح' },
        { status: 400 }
      );
    }

    const cleanPhone = phoneVal.cleanPhone;

    // 2. Phone Rate Limiting (3 requests per minute per phone)
    const phoneLimit = await checkRateLimit(`pwd-reset-phone:${cleanPhone}`, 3, 60 * 1000);
    if (!phoneLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'تم إرسال طلبات متعددة لهذا الرقم مؤخرًا، يرجى الانتظار قليلاً.',
          retryAfterSeconds: phoneLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(phoneLimit.retryAfterSeconds) },
        }
      );
    }

    // 3. Check if a user exists with this phantom email (anti-enumeration: ignore silently)
    const phantomEmail = `${cleanPhone}@${PHANTOM_DOMAIN}`;
    const adminClient = getServiceSupabase();

    let userExists = false;
    let businessId: string | null = null;

    try {
      // Find the user via phantom email
      const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const matchedUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === phantomEmail.toLowerCase()
      );
      userExists = Boolean(matchedUser);

      // Get businessId for SMS sending (any active business)
      if (userExists) {
        const { data: bizData } = await adminClient
          .from('businesses')
          .select('id')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        businessId = bizData?.id || null;
      }
    } catch (lookupErr) {
      console.warn('[reset-password] User lookup warning (non-fatal):', lookupErr);
    }

    // 4. Generate OTP and send SMS (only if user exists, but return same message either way)
    if (userExists && businessId) {
      try {
        const otpResult = await generatePasswordChangeOtp(cleanPhone, 'phone');
        if (otpResult.success && otpResult.otp) {
          await sendSms({
            businessId,
            to: cleanPhone,
            text: `Pointat: كود إعادة تعيين كلمة المرور: ${otpResult.otp} — صالح لمدة 10 دقائق.`,
          });
        }
      } catch (otpErr) {
        // Fail-silent: do not expose internal error
        console.warn('[reset-password] OTP send warning (fail-silent):', otpErr);
      }
    }

    // 5. Always return the same generic response (anti-enumeration)
    return NextResponse.json({
      success: true,
      message: 'لو الرقم ده مسجل عندنا، هيوصلك كود التحقق على موبايلك',
    });
  } catch (err: any) {
    console.error('POST /api/auth/reset-password error:', err);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء معالجة الطلب' },
      { status: 500 }
    );
  }
}
