import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { generatePhoneOtp } from '@/lib/otp';
import { sendSms } from '@/lib/sms';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/cashier/redemption-otp
 *
 * Phase 35: Redemption OTP Guard
 *
 * Called automatically by the cashier UI when a redemption transaction
 * is initiated. Sends a 6-digit OTP to the customer's registered phone
 * number. The OTP is stored in Redis (10-min TTL, 60-sec cooldown).
 *
 * Body: { businessId, customerId }
 * Returns: { success, cooldownRemaining? }
 *
 * Security:
 * - Requires an authenticated cashier session.
 * - IP rate limited: 20 requests/minute.
 * - Per-customer rate limited: 5 OTPs per 15 minutes (built-in OTP lib).
 * - SMS failures are non-blocking (fail-silent).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit(`redemption-otp-ip:${ip}`, 20, 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'تم تجاوز الحد المسموح للطلبات. يرجى الانتظار قليلاً.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { businessId, customerId } = body;

    if (!businessId || !customerId) {
      return NextResponse.json(
        { success: false, error: 'businessId و customerId مطلوبان' },
        { status: 400 }
      );
    }

    // Require cashier auth for this business
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    // Fetch customer phone number
    const adminClient = getServiceSupabase();
    const { data: customer, error: custErr } = await adminClient
      .from('customers')
      .select('id, name, phone_number')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (custErr || !customer) {
      return NextResponse.json(
        { success: false, error: 'العميل غير موجود' },
        { status: 404 }
      );
    }

    const phone = customer.phone_number;
    if (!phone || phone.replace(/\D/g, '').length < 8) {
      return NextResponse.json(
        { success: false, error: 'لا يوجد رقم موبايل مسجل لهذا العميل' },
        { status: 400 }
      );
    }

    // Generate OTP (uses lib/otp.ts phone OTP with 10-min TTL + 60-sec cooldown)
    const otpResult = await generatePhoneOtp(phone.replace(/\D/g, ''));

    if (!otpResult.success) {
      if (otpResult.error === 'COOLDOWN_ACTIVE') {
        return NextResponse.json(
          {
            success: false,
            error: 'تم إرسال كود بالفعل. يرجى الانتظار قليلاً قبل طلب كود جديد.',
            cooldownRemaining: otpResult.cooldownRemaining,
          },
          { status: 429 }
        );
      }
      if (otpResult.error === 'MAX_OTP_PER_15_MIN_EXCEEDED') {
        return NextResponse.json(
          {
            success: false,
            error: 'تجاوزت الحد الأقصى لإرسال الأكواد. يرجى المحاولة بعد ربع ساعة.',
            cooldownRemaining: otpResult.cooldownRemaining,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'فشل إنشاء كود التحقق. يرجى المحاولة مرة أخرى.' },
        { status: 500 }
      );
    }

    // Send OTP via SMS (fail-silent — never blocks redemption)
    if (otpResult.otp) {
      sendSms({
        businessId,
        to: phone,
        text: `Pointat: كود تأكيد استبدال النقاط: ${otpResult.otp} — صالح لمدة 10 دقائق.`,
      }).catch((err) => {
        console.warn('[redemption-otp] SMS send non-blocking error:', err);
      });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال كود التحقق على موبايل العميل',
    });
  } catch (err: any) {
    console.error('POST /api/cashier/redemption-otp error:', err);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء إرسال كود التحقق' },
      { status: 500 }
    );
  }
}
