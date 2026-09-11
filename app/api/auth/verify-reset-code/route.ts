import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phase 23.4: Verify OTP code and update password
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    // Rate limiting on OTP verification attempts (10 requests/minute) to stop brute-forcing
    const limit = await checkRateLimit(`verify-otp-ip:${ip}`, 10, 60 * 1000);
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
    const { email, token, newPassword } = body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: 'صيغة البريد الإلكتروني غير صالحة' },
        { status: 400 }
      );
    }

    if (!token || typeof token !== 'string' || !token.trim()) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رمز التحقق المستلم (OTP)' },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'يجب أن لا تقل كلمة المرور الجديدة عن 6 أحرف' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    const adminClient = getServiceSupabase();

    // 1. Verify OTP with Supabase Auth (type: 'recovery')
    const { data: verifyData, error: verifyErr } = await adminClient.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'recovery',
    });

    if (verifyErr || !verifyData.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'رمز التحقق غير صحيح أو انتهت صلاحيته. يرجى التأكد وإعادة المحاولة.',
        },
        { status: 400 }
      );
    }

    // 2. Set new password for the verified user
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      verifyData.user.id,
      { password: newPassword }
    );

    if (updateErr) {
      console.error('Failed to update user password:', updateErr);
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
