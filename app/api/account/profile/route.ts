import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { 
  generateEmailOtp, 
  generatePhoneOtp, 
  verifyEmailOtp, 
  verifyPhoneOtp, 
  getOtpCooldownRemaining, 
  getPhoneOtpCooldownRemaining,
  normalizeEmail,
  normalizePhone,
  generatePasswordChangeOtp,
  verifyPasswordChangeOtp,
  check15MinOtpRateLimit
} from '@/lib/otp';
import { sendVerificationOtpEmail } from '@/lib/email';
import { validateEgyptianPhone, validateEmail, validatePassword } from '@/lib/validation';

/**
 * Helper to authenticate request and get current user
 */
async function authenticateUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid authorization header', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !user) {
    return { error: 'Unauthorized user session', status: 401 };
  }

  return { user, token };
}

/**
 * GET /api/account/profile
 * Returns the current authenticated user's profile information
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { user } = auth;
    const adminClient = getServiceSupabase();

    // 1. Fetch user roles from user_roles
    const { data: roles } = await adminClient
      .from('user_roles')
      .select('role, business_id, branch_id, businesses (name)')
      .eq('user_id', user.id);

    // 2. Fetch customer links if any
    const { data: customerLinks } = await adminClient
      .from('customer_auth_links')
      .select('customer_id, customers (id, name, phone_number, business_id)')
      .eq('auth_user_id', user.id);

    // Resolve name
    const rawName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const customerName = (customerLinks?.[0] as any)?.customers?.name || '';
    const resolvedName = rawName || customerName || '';

    // Resolve phone
    const rawPhone = user.user_metadata?.phone || (user.phone ? user.phone.replace(/^\+20/, '0') : '');
    const customerPhone = (customerLinks?.[0] as any)?.customers?.phone_number || '';
    const resolvedPhone = rawPhone || customerPhone || '';

    // Resolve primary role
    let primaryRole = 'customer';
    let businessName = '';

    if (roles && roles.length > 0) {
      if (roles.some(r => r.role === 'super_admin')) {
        primaryRole = 'super_admin';
      } else if (roles.some(r => r.role === 'owner')) {
        primaryRole = 'owner';
        const ownerR = roles.find(r => r.role === 'owner');
        businessName = (ownerR as any)?.businesses?.name || '';
      } else if (roles.some(r => r.role === 'branch_admin')) {
        primaryRole = 'branch_admin';
        const baR = roles.find(r => r.role === 'branch_admin');
        businessName = (baR as any)?.businesses?.name || '';
      } else if (roles.some(r => r.role === 'cashier')) {
        primaryRole = 'cashier';
        const cashR = roles.find(r => r.role === 'cashier');
        businessName = (cashR as any)?.businesses?.name || '';
      }
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        email: user.email || '',
        name: resolvedName,
        phone: resolvedPhone,
        role: primaryRole,
        businessName,
        linkedPlacesCount: customerLinks?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('GET /api/account/profile error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/account/profile
 * Handles:
 * 1. action: 'update_name' -> Direct name update without OTP
 * 2. action: 'request_otp' -> Generates & dispatches OTP for new email (via SMTP) or new phone (via simulated/real SMS)
 * 3. action: 'verify_and_update' -> Verifies 6-digit OTP against Redis and updates auth/DB
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { user } = auth;
    const adminClient = getServiceSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, type, target, otp, name } = body;

    // ──── 1. UPDATE NAME (DIRECT, NO OTP NEEDED) ────
    if (action === 'update_name') {
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'الاسم يجب أن يحتوي على حرفين على الأقل' },
          { status: 400 }
        );
      }

      const cleanName = name.trim();

      // Update Supabase Auth metadata
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          name: cleanName,
          full_name: cleanName,
        },
      });

      // Update linked customer records if any
      const { data: customerLinks } = await adminClient
        .from('customer_auth_links')
        .select('customer_id')
        .eq('auth_user_id', user.id);

      const customerIds = (customerLinks || []).map(l => l.customer_id);
      if (customerIds.length > 0) {
        await adminClient
          .from('customers')
          .update({ name: cleanName })
          .in('id', customerIds);
      }

      return NextResponse.json({
        success: true,
        message: 'تم تحديث الاسم بنجاح',
        profile: {
          name: cleanName,
        },
      });
    }

    // ──── 2. REQUEST OTP FOR NEW EMAIL OR PHONE ────
    if (action === 'request_otp') {
      if (!type || (type !== 'email' && type !== 'phone')) {
        return NextResponse.json(
          { success: false, error: 'نوع التحقق غير صالح (يجب أن يكون email أو phone)' },
          { status: 400 }
        );
      }

      if (!target || typeof target !== 'string') {
        return NextResponse.json(
          { success: false, error: 'البيانات المدخلة غير مكتملة' },
          { status: 400 }
        );
      }

      // ── TYPE A: EMAIL OTP REQUEST ──
      if (type === 'email') {
        const emailVal = validateEmail(target);
        if (!emailVal.isValid) {
          return NextResponse.json(
            { success: false, error: 'صيغة البريد الإلكتروني غير صالحة' },
            { status: 400 }
          );
        }

        const cleanEmail = normalizeEmail(target);

        // Check if same as current
        if (cleanEmail === user.email?.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'البريد الإلكتروني المدخل هو بريدك الحالي نفسه' },
            { status: 400 }
          );
        }

        // Check if another account is already using this email
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const existing = listData?.users?.find(
          u => u.email?.toLowerCase() === cleanEmail && u.id !== user.id
        );
        if (existing) {
          return NextResponse.json(
            { success: false, code: 'EMAIL_ALREADY_EXISTS', error: 'هذا البريد الإلكتروني مسجل بالفعل لحساب آخر' },
            { status: 400 }
          );
        }

        // Check cooldown
        const cooldown = await getOtpCooldownRemaining(cleanEmail);
        if (cooldown > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `يرجى الانتظار ${cooldown} ثانية قبل طلب رمز جديد.`,
              cooldownRemaining: cooldown,
            },
            { status: 429 }
          );
        }

        // Generate OTP in Redis
        const otpRes = await generateEmailOtp(cleanEmail);
        if (!otpRes.success || !otpRes.otp) {
          return NextResponse.json(
            { success: false, error: 'فشل إنشاء رمز التحقق، يرجى المحاولة لاحقاً' },
            { status: 500 }
          );
        }

        // Send Email via Gmail SMTP / Resend
        const recipientName = name?.trim() || user.user_metadata?.full_name || user.user_metadata?.name;
        await sendVerificationOtpEmail(cleanEmail, otpRes.otp, recipientName);

        return NextResponse.json({
          success: true,
          type: 'email',
          message: 'تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الجديد.',
          cooldownSeconds: 60,
        });
      }

      // ── TYPE B: PHONE OTP REQUEST ──
      if (type === 'phone') {
        const phoneVal = validateEgyptianPhone(target);
        if (!phoneVal.isValid) {
          return NextResponse.json(
            { success: false, error: phoneVal.errorMessage || 'رقم الموبايل غير صالح' },
            { status: 400 }
          );
        }

        const cleanPhone = phoneVal.cleanPhone;
        const currentPhone = (user.user_metadata?.phone || '').replace(/\D/g, '');

        if (cleanPhone === currentPhone) {
          return NextResponse.json(
            { success: false, error: 'رقم الموبايل المدخل هو رقمك الحالي نفسه' },
            { status: 400 }
          );
        }

        // Check cooldown
        const cooldown = await getPhoneOtpCooldownRemaining(cleanPhone);
        if (cooldown > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `يرجى الانتظار ${cooldown} ثانية قبل طلب رمز جديد.`,
              cooldownRemaining: cooldown,
            },
            { status: 429 }
          );
        }

        // Generate OTP in Redis
        const otpRes = await generatePhoneOtp(cleanPhone);
        if (!otpRes.success || !otpRes.otp) {
          return NextResponse.json(
            { success: false, error: 'فشل إنشاء رمز التحقق، يرجى المحاولة لاحقاً' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          type: 'phone',
          message: 'تم إرسال رمز التحقق إلى رقم هاتفك الجديد.',
          cooldownSeconds: 60,
          simulatedSms: {
            phone: cleanPhone,
            otp: otpRes.otp,
          },
        });
      }
    }

    // ──── 3. VERIFY OTP AND COMMIT UPDATE ────
    if (action === 'verify_and_update') {
      if (!type || (type !== 'email' && type !== 'phone')) {
        return NextResponse.json(
          { success: false, error: 'نوع التحقق غير صالح' },
          { status: 400 }
        );
      }

      if (!target || !otp) {
        return NextResponse.json(
          { success: false, error: 'رمز التحقق والوجهة مطلوبان' },
          { status: 400 }
        );
      }

      const cleanName = (name && typeof name === 'string' && name.trim().length >= 2) ? name.trim() : undefined;

      // ── VERIFY EMAIL OTP ──
      if (type === 'email') {
        const cleanEmail = normalizeEmail(target);
        const verifyRes = await verifyEmailOtp(cleanEmail, String(otp));

        if (!verifyRes.valid) {
          const errorMsg = verifyRes.error === 'MAX_ATTEMPTS_EXCEEDED'
            ? 'تم تجاوز الحد الأقصى للمحاولات، تم إلغاء الرمز. يرجى طلب رمز جديد.'
            : verifyRes.error === 'EXPIRED_OR_NOT_FOUND'
            ? 'رمز التحقق غير صحيح أو انتهت صلاحيته'
            : `رمز التحقق غير صحيح. المحاولات المتبقية: ${verifyRes.attemptsLeft ?? 0}`;

          return NextResponse.json(
            {
              success: false,
              error: errorMsg,
              code: verifyRes.error,
              attemptsLeft: verifyRes.attemptsLeft,
            },
            { status: 400 }
          );
        }

        // Commit update in Supabase Auth
        const updatePayload: any = {
          email: cleanEmail,
          email_confirm: true,
          user_metadata: {
            ...user.user_metadata,
            ...(cleanName ? { name: cleanName, full_name: cleanName } : {}),
          },
        };

        const { error: updateErr } = await adminClient.auth.admin.updateUserById(
          user.id,
          updatePayload
        );

        if (updateErr) {
          console.error('Failed to update user email in auth:', updateErr);
          return NextResponse.json(
            { success: false, error: updateErr.message || 'فشل تحديث البريد في قاعدة البيانات' },
            { status: 500 }
          );
        }

        // If customer records exist and name was provided, update customers.name
        if (cleanName) {
          const { data: customerLinks } = await adminClient
            .from('customer_auth_links')
            .select('customer_id')
            .eq('auth_user_id', user.id);

          const customerIds = (customerLinks || []).map(l => l.customer_id);
          if (customerIds.length > 0) {
            await adminClient
              .from('customers')
              .update({ name: cleanName })
              .in('id', customerIds);
          }
        }

        return NextResponse.json({
          success: true,
          message: 'تم تأكيد وتحديث البريد الإلكتروني بنجاح!',
          profile: {
            email: cleanEmail,
            name: cleanName || user.user_metadata?.full_name || user.user_metadata?.name || '',
          },
        });
      }

      // ── VERIFY PHONE OTP ──
      if (type === 'phone') {
        const cleanPhone = normalizePhone(target);
        const verifyRes = await verifyPhoneOtp(cleanPhone, String(otp));

        if (!verifyRes.valid) {
          const errorMsg = verifyRes.error === 'MAX_ATTEMPTS_EXCEEDED'
            ? 'تم تجاوز الحد الأقصى للمحاولات، تم إلغاء الرمز. يرجى طلب رمز جديد.'
            : verifyRes.error === 'EXPIRED_OR_NOT_FOUND'
            ? 'رمز التحقق غير صحيح أو انتهت صلاحيته'
            : `رمز التحقق غير صحيح. المحاولات المتبقية: ${verifyRes.attemptsLeft ?? 0}`;

          return NextResponse.json(
            {
              success: false,
              error: errorMsg,
              code: verifyRes.error,
              attemptsLeft: verifyRes.attemptsLeft,
            },
            { status: 400 }
          );
        }

        // Commit update in Supabase Auth metadata
        const updatePayload: any = {
          user_metadata: {
            ...user.user_metadata,
            phone: cleanPhone,
            ...(cleanName ? { name: cleanName, full_name: cleanName } : {}),
          },
        };

        const { error: updateErr } = await adminClient.auth.admin.updateUserById(
          user.id,
          updatePayload
        );

        if (updateErr) {
          console.error('Failed to update user phone in auth:', updateErr);
          return NextResponse.json(
            { success: false, error: updateErr.message || 'فشل تحديث رقم الهاتف' },
            { status: 500 }
          );
        }

        // If customer, also update linked records in customers table
        const { data: customerLinks } = await adminClient
          .from('customer_auth_links')
          .select('customer_id')
          .eq('auth_user_id', user.id);

        const customerIds = (customerLinks || []).map(l => l.customer_id);
        if (customerIds.length > 0) {
          const custUpdate: any = { phone_number: cleanPhone };
          if (cleanName) custUpdate.name = cleanName;
          await adminClient
            .from('customers')
            .update(custUpdate)
            .in('id', customerIds);
        }

        return NextResponse.json({
          success: true,
          message: 'تم تأكيد وتحديث رقم الموبايل بنجاح!',
          profile: {
            phone: cleanPhone,
            name: cleanName || user.user_metadata?.full_name || user.user_metadata?.name || '',
          },
        });
      }
    }

    // ──── 4. REQUEST OTP FOR PASSWORD CHANGE (VIA EMAIL OR PHONE) ────
    if (action === 'request_password_otp') {
      const { type, target } = body;
      if (!type || (type !== 'email' && type !== 'phone')) {
        return NextResponse.json(
          { success: false, error: 'نوع التحقق غير صالح (يجب أن يكون email أو phone)' },
          { status: 400 }
        );
      }

      let destination = target ? String(target).trim() : '';

      // EMAIL FLOW
      if (type === 'email') {
        if (!destination) {
          destination = user.email || '';
        }
        const val = validateEmail(destination);
        if (!val.isValid) {
          return NextResponse.json({ success: false, error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
        }
        const cleanEmail = normalizeEmail(destination);

        const otpRes = await generatePasswordChangeOtp(cleanEmail, 'email');
        if (!otpRes.success) {
          return NextResponse.json(
            {
              success: false,
              error: otpRes.message || (otpRes.error === 'MAX_OTP_PER_15_MIN_EXCEEDED'
                ? 'تجاوزت الحد الأقصى لإرسال رمز التحقق (5 محاولات خلال 15 دقيقة). يرجى الانتظار والمحاولة لاحقاً.'
                : `يرجى الانتظار ${otpRes.cooldownRemaining || 60} ثانية قبل طلب رمز جديد.`),
              cooldownRemaining: otpRes.cooldownRemaining,
              code: otpRes.error,
            },
            { status: 429 }
          );
        }

        // Send Email
        const recipientName = user.user_metadata?.full_name || user.user_metadata?.name;
        await sendVerificationOtpEmail(cleanEmail, otpRes.otp!, recipientName);

        return NextResponse.json({
          success: true,
          type: 'email',
          target: cleanEmail,
          message: 'تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني بنجاح.',
          cooldownSeconds: 60,
        });
      }

      // PHONE FLOW
      if (type === 'phone') {
        if (!destination) {
          destination = (user.user_metadata?.phone || user.phone || '').replace(/^\+20/, '0');
        }
        if (!destination) {
          return NextResponse.json(
            { success: false, error: 'لم يتم تعيين رقم موبايل لهذا الحساب بعد. يرجى إدخال رقم الموبايل أو اختيار البريد الإلكتروني.' },
            { status: 400 }
          );
        }
        const val = validateEgyptianPhone(destination);
        if (!val.isValid) {
          return NextResponse.json({ success: false, error: val.errorMessage || 'رقم الموبايل غير صالح' }, { status: 400 });
        }
        const cleanPhone = val.cleanPhone;

        const otpRes = await generatePasswordChangeOtp(cleanPhone, 'phone');
        if (!otpRes.success) {
          return NextResponse.json(
            {
              success: false,
              error: otpRes.message || (otpRes.error === 'MAX_OTP_PER_15_MIN_EXCEEDED'
                ? 'تجاوزت الحد الأقصى لإرسال رمز التحقق (5 محاولات خلال 15 دقيقة). يرجى الانتظار والمحاولة لاحقاً.'
                : `يرجى الانتظار ${otpRes.cooldownRemaining || 60} ثانية قبل طلب رمز جديد.`),
              cooldownRemaining: otpRes.cooldownRemaining,
              code: otpRes.error,
            },
            { status: 429 }
          );
        }

        return NextResponse.json({
          success: true,
          type: 'phone',
          target: cleanPhone,
          message: 'تم إرسال رمز التحقق إلى رقم هاتفك بنجاح.',
          cooldownSeconds: 60,
          simulatedSms: {
            phone: cleanPhone,
            otp: otpRes.otp,
          },
        });
      }
    }

    // ──── 5. VERIFY OTP AND COMMIT PASSWORD UPDATE ────
    if (action === 'verify_password_change') {
      const { type, target, otp, newPassword } = body;
      if (!type || (type !== 'email' && type !== 'phone')) {
        return NextResponse.json({ success: false, error: 'نوع التحقق غير صالح' }, { status: 400 });
      }
      if (!target || !otp) {
        return NextResponse.json({ success: false, error: 'رمز التحقق والوجهة مطلوبان' }, { status: 400 });
      }

      // Validate password
      const pwdVal = validatePassword(newPassword || '');
      if (!pwdVal.isValid) {
        return NextResponse.json({ success: false, error: pwdVal.errorMessage || 'كلمة المرور غير صالحة' }, { status: 400 });
      }

      const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);
      const verifyRes = await verifyPasswordChangeOtp(cleanTarget, type, String(otp));

      if (!verifyRes.valid) {
        const errorMsg = verifyRes.error === 'MAX_ATTEMPTS_EXCEEDED'
          ? 'تم تجاوز الحد الأقصى للمحاولات، تم إلغاء الرمز. يرجى طلب رمز جديد.'
          : verifyRes.error === 'EXPIRED_OR_NOT_FOUND'
          ? 'رمز التحقق غير صحيح أو انتهت صلاحيته'
          : `رمز التحقق غير صحيح. المحاولات المتبقية: ${verifyRes.attemptsLeft ?? 0}`;

        return NextResponse.json(
          {
            success: false,
            error: errorMsg,
            code: verifyRes.error,
            attemptsLeft: verifyRes.attemptsLeft,
          },
          { status: 400 }
        );
      }

      // Update password in Supabase Auth
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        user.id,
        { password: String(newPassword).trim() }
      );

      if (updateErr) {
        console.error('Failed to update password in auth:', updateErr);
        return NextResponse.json(
          { success: false, error: updateErr.message || 'فشل تحديث كلمة المرور في قاعدة البيانات' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'تم تغيير وتحديث كلمة المرور بنجاح!',
      });
    }

    return NextResponse.json(
      { success: false, error: 'إجراء غير معروف' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('PATCH /api/account/profile error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
