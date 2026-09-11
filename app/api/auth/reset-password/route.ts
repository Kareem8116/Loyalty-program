import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_RESPONSE_MESSAGE = 'لو الإيميل ده مسجل عندنا، هيوصلك رمز إعادة التعيين';

/**
 * Phase 23.3, 23.5 & 23.6: Request OTP / Password Reset Email
 * 
 * Security Features:
 * 1. Rate Limiting: Max 5 requests/min per IP and max 3 requests/min per email to stop spam.
 * 2. Anti-Account Enumeration: Always returns the exact same generic message regardless
 *    of whether the email exists in Supabase Auth or not.
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
    const { email } = body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: 'صيغة البريد الإلكتروني غير صالحة' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 2. Email Rate Limiting (3 requests per minute per email)
    const emailLimit = await checkRateLimit(`pwd-reset-email:${cleanEmail}`, 3, 60 * 1000);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'تم إرسال طلبات متعددة لهذا البريد مؤخرًا، يرجى الانتظار قليلاً.',
          retryAfterSeconds: emailLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(emailLimit.retryAfterSeconds) },
        }
      );
    }

    // 3. Trigger Supabase resetPasswordForEmail
    const adminClient = getServiceSupabase();
    try {
      await adminClient.auth.resetPasswordForEmail(cleanEmail);
    } catch (resetErr) {
      // Intentionally log internally and continue (PLAN 23.5: Fail-silent without leaking account existence)
      console.warn(`resetPasswordForEmail internal notice for ${cleanEmail}:`, resetErr);
    }

    // 4. Return generic success message (Phase 23.5)
    return NextResponse.json({
      success: true,
      message: GENERIC_RESPONSE_MESSAGE,
    });
  } catch (err: any) {
    console.error('POST /api/auth/reset-password error:', err);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء معالجة الطلب' },
      { status: 500 }
    );
  }
}
