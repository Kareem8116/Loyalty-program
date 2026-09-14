import { NextRequest, NextResponse } from 'next/server';
import { recordPointsTransaction } from '@/lib/cashier';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { redis } from '@/lib/redis';
import { getServiceSupabase } from '@/lib/supabase';
import { isFeatureEnabled } from '@/lib/features';
import { sendSms } from '@/lib/sms';
import { verifyPhoneOtp } from '@/lib/otp';

// Fallback in-memory map for idempotency keys if Redis is unreachable
const memoryIdempotency = new Map<string, { data: any; timestamp: number }>();

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
    const {
      businessId,
      branchId,
      customerId,
      pointsChange,
      reason,
      invoiceReference,
      customerPin,
      managerPin,
      idempotencyKey: bodyIdempotencyKey,
      redemptionOtp,
    } = body;

    const headerIdempotencyKey = request.headers.get('Idempotency-Key') || request.headers.get('x-idempotency-key');
    const idempotencyKey = bodyIdempotencyKey || headerIdempotencyKey;

    if (!businessId || !customerId || pointsChange === undefined || !reason) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: businessId, customerId, pointsChange, reason' },
        { status: 400 }
      );
    }

    const pointsNum = parseInt(pointsChange, 10);
    if (isNaN(pointsNum) || pointsNum === 0) {
      return NextResponse.json(
        { success: false, error: 'Points change must be a non-zero integer' },
        { status: 400 }
      );
    }

    // 15.10: Invoice reference is mandatory for points additions (POS sync)
    if (pointsNum > 0 && (!invoiceReference || !invoiceReference.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: 'رقم الفاتورة إلزامي لعمليات إضافة النقاط',
          errorCode: 'INVOICE_REQUIRED',
        },
        { status: 400 }
      );
    }

    // Phase 35: Redemption OTP Guard — all redemptions (pointsChange < 0) require a valid phone OTP
    if (pointsNum < 0) {
      if (!redemptionOtp || typeof redemptionOtp !== 'string' || !redemptionOtp.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: 'يجب إدخال كود التحقق الذي وصل على موبايل العميل قبل تنفيذ الاستبدال',
            errorCode: 'REDEMPTION_OTP_REQUIRED',
          },
          { status: 403 }
        );
      }

      // Fetch the customer's phone number to verify OTP against
      const adminClientForOtp = getServiceSupabase();
      const { data: customerForOtp, error: otpCustErr } = await adminClientForOtp
        .from('customers')
        .select('phone_number')
        .eq('id', customerId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (otpCustErr || !customerForOtp?.phone_number) {
        return NextResponse.json(
          { success: false, error: 'تعذر التحقق من بيانات العميل', errorCode: 'CUSTOMER_NOT_FOUND' },
          { status: 404 }
        );
      }

      const cleanPhone = customerForOtp.phone_number.replace(/\D/g, '');
      const otpVerification = await verifyPhoneOtp(cleanPhone, redemptionOtp.trim());

      if (!otpVerification.valid) {
        if (otpVerification.error === 'EXPIRED_OR_NOT_FOUND') {
          return NextResponse.json(
            {
              success: false,
              error: 'انتهت صلاحية كود التحقق أو لم يُرسَل بعد. يرجى إرسال كود جديد.',
              errorCode: 'INVALID_REDEMPTION_OTP',
            },
            { status: 403 }
          );
        }
        if (otpVerification.error === 'MAX_ATTEMPTS_EXCEEDED') {
          return NextResponse.json(
            {
              success: false,
              error: 'تجاوزت الحد الأقصى لمحاولات التحقق. يرجى إرسال كود جديد.',
              errorCode: 'REDEMPTION_OTP_MAX_ATTEMPTS',
            },
            { status: 429 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: `كود التحقق غير صحيح.${otpVerification.attemptsLeft !== undefined ? ` متبقي ${otpVerification.attemptsLeft} محاولة.` : ''}`,
            errorCode: 'INVALID_REDEMPTION_OTP',
            attemptsLeft: otpVerification.attemptsLeft,
          },
          { status: 403 }
        );
      }
    }

    // 15.11: Check Idempotency Key (network retry / double-tap prevention)
    const idempotencyCacheKey = idempotencyKey ? `idempotency:${businessId}:${idempotencyKey}` : null;
    if (idempotencyCacheKey) {
      try {
        let cached: any = null;
        try {
          cached = await redis.get(idempotencyCacheKey);
        } catch {
          const mem = memoryIdempotency.get(idempotencyCacheKey);
          if (mem && Date.now() - mem.timestamp < 3600 * 1000) {
            cached = mem.data;
          }
        }

        if (cached) {
          const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return NextResponse.json(
            {
              success: true,
              message: 'تم تنفيذ هذه العملية بالفعل',
              isDuplicateSubmission: true,
              newBalance: parsed.newBalance,
              transaction: parsed.transaction,
            },
            { status: 200 }
          );
        }
      } catch (err) {
        console.warn('Idempotency check error (non-fatal):', err);
      }
    }

    // Central Tenant & Auth Guard: Authenticates user, ensures they belong to businessId, and passes RLS client
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    const { userId, branchId: userBranchId, supabase: userClient } = guard.context;

    const result = await recordPointsTransaction({
      businessId,
      branchId: branchId || userBranchId || null,
      customerId,
      pointsChange: pointsNum,
      reason,
      createdBy: userId,
      client: userClient,
      asyncQueue: false, // Ensure immediate write for accurate invoice uniqueness
      checkDailyLimit: true,
      invoiceReference: invoiceReference ? invoiceReference.trim() : null,
      customerPin: customerPin ? String(customerPin).trim() : null,
      managerPin: managerPin ? String(managerPin).trim() : null,
    });

    const responsePayload = {
      success: true,
      newBalance: result.newBalance,
      transaction: result.ledgerRecord,
    };

    // Store idempotency key for 1 hour
    if (idempotencyCacheKey) {
      try {
        await redis.setex(idempotencyCacheKey, 3600, JSON.stringify(responsePayload));
      } catch {
        memoryIdempotency.set(idempotencyCacheKey, { data: responsePayload, timestamp: Date.now() });
      }
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('API /api/cashier/points error:', error);

    // Phase 32.6: Handle offline sync failure logging & optional Owner SMS
    if (body?.isOfflineSync) {
      try {
        const adminClient = getServiceSupabase();
        const bId = body.businessId;
        const cId = body.customerId;
        const pNum = parseInt(body.pointsChange, 10) || 0;
        const rsn = body.reason || 'offline_sync';
        const invRef = body.invoiceReference || null;

        await adminClient.from('audit_log').insert({
          business_id: bId,
          action: 'offline_sync_failed',
          details: {
            customerId: cId,
            pointsChange: pNum,
            reason: rsn,
            invoiceReference: invRef,
            errorMessage: error.message,
            errorCode: error.code || 'SYNC_ERROR',
          },
        });

        const isNotifyEnabled = await isFeatureEnabled(bId, 'notify_owner_sync_failure');
        if (isNotifyEnabled) {
          const { data: ownerRole } = await adminClient
            .from('user_roles')
            .select('user_id')
            .eq('business_id', bId)
            .eq('role', 'owner')
            .limit(1)
            .maybeSingle();

          if (ownerRole?.user_id) {
            const { data: ownerUser } = await adminClient.auth.admin.getUserById(ownerRole.user_id);
            const ownerPhone = ownerUser?.user?.phone || ownerUser?.user?.user_metadata?.phone_number;
            if (ownerPhone) {
              await sendSms({
                businessId: bId,
                to: ownerPhone,
                text: `Pointat: تنبيه للمالك: فشلت مزامنة عملية أوفلاين بقيمة ${pNum} نقطة. السبب: ${error.message || 'رفض العملية'}`,
              });
            }
          }
        }
      } catch (logErr) {
        console.warn('Offline sync failure logging non-blocking error:', logErr);
      }
    }

    // 15.11: Distinct rejection for duplicate invoice reference
    if (error.code === 'DUPLICATE_INVOICE') {
      return NextResponse.json(
        {
          success: false,
          error: 'رقم الفاتورة هذا مُسجَّل بالفعل في عملية سابقة',
          errorCode: 'DUPLICATE_INVOICE',
          invoiceReference: error.invoiceReference,
        },
        { status: 409 }
      );
    }

    // 15.12: Per-minute rate limit exceeded
    if (error.code === 'PER_MINUTE_LIMIT_EXCEEDED') {
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'تجاوزت الحد المسموح به من العمليات في الدقيقة الواحدة. يرجى الانتظار.',
          errorCode: 'PER_MINUTE_LIMIT_EXCEEDED',
          minuteLimit: error.minuteLimit,
        },
        { status: 429 }
      );
    }

    // 15.2: Daily points limit exceeded
    if (error.code === 'DAILY_LIMIT_EXCEEDED') {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          errorCode: 'DAILY_LIMIT_EXCEEDED',
          pointsAddedToday: error.pointsAddedToday,
          dailyLimit: error.dailyLimit,
        },
        { status: 403 }
      );
    }

    // Phase 35: Redemption OTP errors
    if (
      error.code === 'REDEMPTION_OTP_REQUIRED' ||
      error.code === 'INVALID_REDEMPTION_OTP' ||
      error.code === 'REDEMPTION_OTP_MAX_ATTEMPTS'
    ) {
      return NextResponse.json(
        { success: false, error: error.message, errorCode: error.code },
        { status: 403 }
      );
    }

    // 15.6: High-value redemption customer PIN required or invalid
    if (error.code === 'CUSTOMER_PIN_REQUIRED' || error.code === 'INVALID_CUSTOMER_PIN') {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          errorCode: error.code,
          threshold: error.threshold,
        },
        { status: 403 }
      );
    }

    // 15.8: Invalid manager PIN on retry
    if (error.code === 'INVALID_MANAGER_PIN') {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          errorCode: 'INVALID_MANAGER_PIN',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 400 }
    );
  }
}
