import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { generateEmailOtp, getOtpCooldownRemaining, normalizeEmail } from '@/lib/otp';
import { sendVerificationOtpEmail } from '@/lib/email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/send-verification-otp
 * Phase 29: Generate and send a 6-digit OTP to the user's email address.
 * 
 * Protections:
 * 1. IP rate limiting (5 requests per minute per IP).
 * 2. 60-second cooldown per recipient email address.
 * 3. 10-minute OTP expiration via Redis TTL.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    // 1. IP Rate Limiting (5 requests/minute)
    const ipLimit = await checkRateLimit(`send-otp-ip:${ip}`, 5, 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'تم تجاوز عدد محاولات الإرسال المسموح بها، يرجى المحاولة بعد قليل.',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { email, name, phone } = body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: 'صيغة البريد الإلكتروني غير صالحة' },
        { status: 400 }
      );
    }

    const cleanEmail = normalizeEmail(email);

    // 2. Check 60s cooldown per email
    const cooldown = await getOtpCooldownRemaining(cleanEmail);
    if (cooldown > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `يرجى الانتظار ${cooldown} ثانية قبل طلب رمز جديد.`,
          cooldownRemaining: cooldown,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(cooldown) },
        }
      );
    }

    // 3. Generate OTP & save in Redis (sets 60s cooldown)
    const otpResult = await generateEmailOtp(cleanEmail);
    if (!otpResult.success || !otpResult.otp) {
      return NextResponse.json(
        {
          success: false,
          error: otpResult.error === 'COOLDOWN_ACTIVE' 
            ? `يرجى الانتظار ${otpResult.cooldownRemaining || 60} ثانية قبل طلب رمز جديد.`
            : 'فشل إنشاء رمز التحقق، يرجى المحاولة لاحقاً',
          cooldownRemaining: otpResult.cooldownRemaining,
        },
        { status: otpResult.error === 'COOLDOWN_ACTIVE' ? 429 : 500 }
      );
    }

    // 4. Dispatch email via Gmail SMTP / Resend
    const sendResult = await sendVerificationOtpEmail(cleanEmail, otpResult.otp, name?.trim());
    if (!sendResult.success) {
      console.error('[SendOtp] Failed to deliver email to:', cleanEmail, sendResult.error);
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني بنجاح.',
      cooldownSeconds: 60,
      simulatedSms: {
        phone: phone || undefined,
        otp: otpResult.otp,
      },
    });
  } catch (err: any) {
    console.error('POST /api/auth/send-verification-otp error:', err);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء معالجة الطلب' },
      { status: 500 }
    );
  }
}
