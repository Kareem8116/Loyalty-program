import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyPasswordChangeOtp } from '@/lib/otp';
import { validateEgyptianPhone, validatePassword } from '@/lib/validation';

const PHANTOM_DOMAIN = 'pointat.internal';

/**
 * Phase 23.4 — Phone-based OTP password reset verification:
 *
 * 1. Accepts { phone, token, newPassword }
 * 2. Verifies OTP from Redis (NOT Supabase native OTP)
 * 3. Finds the phantom-email user in Supabase Auth
 * 4. Updates their password
 *
 * Anti-brute-force: 10 attempts per minute per IP.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    // Rate limiting: 10 attempts/minute per IP
    const limit = await checkRateLimit(`verify-reset-otp-ip:${ip}`, 10, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'تم تجاوز الحد المسموح لمحاولات التحقق، يرجى المحاولة بعد قليل.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { phone, token, newPassword } = body;

    // Validate phone
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

    // Validate token
    if (!token || typeof token !== 'string' || !token.trim()) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رمز التحقق المستلم' },
        { status: 400 }
      );
    }

    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال كلمة المرور الجديدة' },
        { status: 400 }
      );
    }

    const passVal = validatePassword(newPassword);
    if (!passVal.isValid) {
      return NextResponse.json(
        { success: false, error: passVal.errorMessage || 'كلمة المرور غير صالحة' },
        { status: 400 }
      );
    }

    const cleanPhone = phoneVal.cleanPhone;

    // Per-phone rate limit (5 attempts/minute)
    const phoneLimit = await checkRateLimit(`verify-reset-phone:${cleanPhone}`, 5, 60 * 1000);
    if (!phoneLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'محاولات كثيرة لهذا الرقم، يرجى الانتظار قليلاً.',
          retryAfterSeconds: phoneLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // 1. Verify the Redis OTP
    const otpResult = await verifyPasswordChangeOtp(cleanPhone, 'phone', token.trim());

    if (!otpResult.valid) {
      if (otpResult.error === 'EXPIRED_OR_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'رمز التحقق غير موجود أو انتهت صلاحيته. يرجى طلب كود جديد.' },
          { status: 400 }
        );
      }
      if (otpResult.error === 'MAX_ATTEMPTS_EXCEEDED') {
        return NextResponse.json(
          { success: false, error: 'تجاوزت الحد الأقصى لمحاولات التحقق. يرجى طلب كود جديد.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى.',
          attemptsLeft: otpResult.attemptsLeft,
        },
        { status: 400 }
      );
    }

    // 2. Find the phantom-email user in Supabase Auth
    const phantomEmail = `${cleanPhone}@${PHANTOM_DOMAIN}`;
    const adminClient = getServiceSupabase();

    let targetUserId: string | null = null;
    try {
      const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const matchedUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === phantomEmail.toLowerCase()
      );
      targetUserId = matchedUser?.id || null;
    } catch (lookupErr) {
      console.warn('[verify-reset-code] User lookup error:', lookupErr);
    }

    if (!targetUserId) {
      // OTP was valid but no user found — should not happen in practice
      console.error('[verify-reset-code] OTP valid but no user found for phone:', cleanPhone);
      return NextResponse.json(
        { success: false, error: 'حدث خطأ أثناء البحث عن الحساب. يرجى التواصل مع الدعم.' },
        { status: 404 }
      );
    }

    // 3. Update the user's password
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });

    if (updateErr) {
      console.error('[verify-reset-code] Failed to update password:', updateErr);
      return NextResponse.json(
        { success: false, error: 'فشل تحديث كلمة المرور، يرجى المحاولة لاحقاً' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    });
  } catch (err: any) {
    console.error('POST /api/auth/verify-reset-code error:', err);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء معالجة الطلب' },
      { status: 500 }
    );
  }
}
