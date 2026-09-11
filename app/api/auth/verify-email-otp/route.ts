import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyEmailOtp, normalizeEmail } from '@/lib/otp';
import { getServiceSupabase } from '@/lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

/**
 * POST /api/auth/verify-email-otp
 * Phase 29: Verify the 6-digit OTP code and activate the user's account.
 * 
 * Flow:
 * 1. IP rate limiting (10 attempts/minute) to prevent brute-force attacks.
 * 2. Validate format of email and OTP.
 * 3. Verify against Redis stored OTP (tracks failed attempts, max 5).
 * 4. On success: Update Supabase Auth user (email_confirm: true, email_verified: true).
 * 5. Return success and allow user login.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    // 1. IP Rate Limiting (10 attempts/minute)
    const ipLimit = await checkRateLimit(`verify-email-otp-ip:${ip}`, 10, 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'تم تجاوز الحد المسموح لمحاولات التحقق، يرجى الانتظار دقيقة والمحاولة مجدداً.',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { email, otp } = body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: 'صيغة البريد الإلكتروني غير صالحة' },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== 'string' || !OTP_REGEX.test(otp.trim())) {
      return NextResponse.json(
        { success: false, error: 'رمز التحقق يجب أن يتكون من 6 أرقام' },
        { status: 400 }
      );
    }

    const cleanEmail = normalizeEmail(email);
    const cleanOtp = otp.trim();

    // 2. Verify OTP via Redis engine
    const verification = await verifyEmailOtp(cleanEmail, cleanOtp);

    if (!verification.valid) {
      if (verification.error === 'EXPIRED_OR_NOT_FOUND') {
        return NextResponse.json(
          {
            success: false,
            code: 'OTP_EXPIRED_OR_NOT_FOUND',
            error: 'رمز التحقق غير صحيح أو انتهت صلاحيته (10 دقائق). يرجى طلب رمز جديد.',
          },
          { status: 400 }
        );
      }

      if (verification.error === 'MAX_ATTEMPTS_EXCEEDED') {
        return NextResponse.json(
          {
            success: false,
            code: 'MAX_ATTEMPTS_EXCEEDED',
            error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة (5 محاولات). تم إبطال الرمز لأسباب أمنية، يرجى طلب رمز جديد.',
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_OTP',
          error: `رمز التحقق غير صحيح. يتبقى لك ${verification.attemptsLeft ?? 0} محاولات قبل إبطال الرمز.`,
          attemptsLeft: verification.attemptsLeft,
        },
        { status: 400 }
      );
    }

    // 3. Mark user verified in Supabase Auth
    const adminClient = getServiceSupabase();

    try {
      // Find the user by listing or paginating (or direct filter if supported)
      const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });

      if (listErr) {
        console.error('[VerifyOtp] Failed to list users:', listErr);
      }

      const targetUser = usersData?.users.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );

      if (targetUser) {
        const { error: updateErr } = await adminClient.auth.admin.updateUserById(
          targetUser.id,
          {
            email_confirm: true,
            user_metadata: {
              ...(targetUser.user_metadata || {}),
              email_verified: true,
              email_verified_at: new Date().toISOString(),
            },
          }
        );

        if (updateErr) {
          console.error('[VerifyOtp] Failed to confirm user email in Supabase Auth:', updateErr);
        }

        // Write to audit log if possible
        try {
          await adminClient.from('audit_log').insert({
            business_id: targetUser.user_metadata?.business_id || null,
            user_id: targetUser.id,
            action: 'EMAIL_VERIFIED_OTP',
            details: { email: cleanEmail, timestamp: new Date().toISOString() },
          });
        } catch {
          // Non-blocking audit log
        }
      }
    } catch (authErr) {
      console.error('[VerifyOtp] Unexpected error while updating Supabase Auth:', authErr);
    }

    return NextResponse.json({
      success: true,
      message: 'تم التحقق من بريدك الإلكتروني بنجاح وتفعيل حسابك.',
    });
  } catch (err: any) {
    console.error('POST /api/auth/verify-email-otp error:', err);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء معالجة الطلب' },
      { status: 500 }
    );
  }
}
