import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isFeatureEnabled } from '@/lib/features';
import { createCustomer, checkCustomerPhoneExists } from '@/lib/customer';
import { getServiceSupabase } from '@/lib/supabase';
import { generateEmailOtp } from '@/lib/otp';
import { sendVerificationOtpEmail } from '@/lib/email';
import { 
  validateName, 
  validateEgyptianPhone, 
  validateEmail, 
  validatePassword, 
  validatePin 
} from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    // 21.6: IP Rate Limiting (10 signup attempts per minute)
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`signup:${clientIp}`, 10, 60 * 1000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many signup attempts. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = await request.json();
    let { businessId, subdomain, name, phoneNumber, consentGiven, referralCode, authUserId, accessPin, email, password } = body;
    const isExplicitBusiness = Boolean(businessId || subdomain);

    const adminClient = getServiceSupabase();

    // Resolve businessId from subdomain if not directly provided
    if (!businessId && subdomain) {
      const { data: biz } = await adminClient
        .from('businesses')
        .select('id')
        .eq('subdomain', subdomain.trim())
        .maybeSingle();

      if (biz) {
        businessId = biz.id;
      }
    }

    // Fallback to active default business if still not set
    if (!businessId) {
      const { data: defaultBiz } = await adminClient
        .from('businesses')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultBiz) {
        businessId = defaultBiz.id;
      }
    }

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required business identifier' },
        { status: 400 }
      );
    }

    // Phase 33: Centralized input validation
    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    const phoneVal = validateEgyptianPhone(phoneNumber);
    if (!phoneVal.isValid) {
      return NextResponse.json(
        { success: false, error: phoneVal.errorMessage, errorKey: phoneVal.errorKey },
        { status: 400 }
      );
    }

    if (email) {
      const emailVal = validateEmail(email);
      if (!emailVal.isValid) {
        return NextResponse.json(
          { success: false, error: emailVal.errorMessage, errorKey: emailVal.errorKey },
          { status: 400 }
        );
      }
    }

    if (password) {
      const passVal = validatePassword(password);
      if (!passVal.isValid) {
        return NextResponse.json(
          { success: false, error: passVal.errorMessage, errorKey: passVal.errorKey },
          { status: 400 }
        );
      }
    }

    if (accessPin) {
      const pinVal = validatePin(accessPin);
      if (!pinVal.isValid) {
        return NextResponse.json(
          { success: false, error: pinVal.errorMessage, errorKey: pinVal.errorKey },
          { status: 400 }
        );
      }
    }

    let isExistingAuthUser = false;
    let generatedOtpCode: string | undefined = undefined;
    // Optional: Create Supabase Auth Central User if email and password are provided
    if (email && password && !authUserId) {
      const cleanEmail = String(email).trim().toLowerCase();
      const { data: newAuthUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: String(password),
        email_confirm: false,
        user_metadata: {
          email_verified: false,
        },
      });

      if (authErr) {
        if (authErr.message?.toLowerCase().includes('already') || (authErr as any).code === 'email_exists') {
          // Find the existing user (staff member, owner, cashier, super-admin, or existing customer)
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existingUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === cleanEmail
          );
          if (existingUser) {
            authUserId = existingUser.id;
            isExistingAuthUser = true;
          } else {
            return NextResponse.json(
              {
                success: false,
                code: 'EMAIL_ALREADY_EXISTS',
                error: 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.',
              },
              { status: 409 }
            );
          }
        } else {
          return NextResponse.json(
            { success: false, error: authErr.message },
            { status: 400 }
          );
        }
      } else if (newAuthUser?.user) {
        authUserId = newAuthUser.user.id;

        // Phase 29: Dispatch verification OTP email
        try {
          const otpRes = await generateEmailOtp(cleanEmail);
          if (otpRes.success && otpRes.otp) {
            generatedOtpCode = otpRes.otp;
            await sendVerificationOtpEmail(cleanEmail, otpRes.otp, name?.trim());
          }
        } catch (otpErr) {
          console.warn('Non-blocking OTP email dispatch error on customer signup:', otpErr);
        }
      }
    }

    // 21.5: Feature Control check — customer_self_signup must be enabled if requested under a specific tenant
    if (isExplicitBusiness) {
      const isSignupEnabled = await isFeatureEnabled(businessId, 'customer_self_signup');
      if (!isSignupEnabled) {
        return NextResponse.json(
          {
            success: false,
            code: 'FEATURE_DISABLED',
            error: 'Customer self-signup is not enabled for this business',
          },
          { status: 403 }
        );
      }
    }

    // 21.1 & 13.3: Mandatory consent check
    if (!consentGiven) {
      return NextResponse.json(
        {
          success: false,
          code: 'CONSENT_REQUIRED',
          error: 'Customer consent is mandatory for registration',
        },
        { status: 400 }
      );
    }

    const cleanPhone = phoneVal.cleanPhone;

    // 21.2: Check if phone number is already registered for this business
    const phoneCheck = await checkCustomerPhoneExists(businessId, cleanPhone);
    if (phoneCheck.exists) {
      if (authUserId && phoneCheck.customerId) {
        await adminClient.from('customer_auth_links').upsert({
          auth_user_id: authUserId,
          customer_id: phoneCheck.customerId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'auth_user_id,customer_id' });

        return NextResponse.json({
          success: true,
          linkedExisting: true,
          customer: {
            id: phoneCheck.customerId,
            name: name.trim(),
            phoneNumber: cleanPhone,
            qrToken: phoneCheck.qrToken,
          },
        }, { status: 200 });
      }

      return NextResponse.json(
        {
          success: false,
          code: 'PHONE_ALREADY_EXISTS',
          error: 'هذا الرقم مسجل بالفعل في هذا المتجر.',
          qrToken: phoneCheck.qrToken,
        },
        { status: 409 }
      );
    }

    // 21.3: Create customer with auto-generated qr_token, referral_code, and consent timestamp
    const newCustomer = await createCustomer({
      businessId,
      name: name.trim(),
      phoneNumber: cleanPhone,
      consentGiven: true,
      referralCode: referralCode?.trim() || undefined,
    });

    // Pre-Phase 27: Link central customer auth user in customer_auth_links if provided
    if (authUserId) {
      try {
        const adminClient = getServiceSupabase();
        let pinHash: string | null = null;
        if (accessPin && typeof accessPin === 'string' && accessPin.length === 4) {
          const crypto = await import('crypto');
          pinHash = crypto.createHash('sha256').update(accessPin.trim()).digest('hex');
        }
        await adminClient.from('customer_auth_links').upsert({
          auth_user_id: authUserId,
          customer_id: newCustomer.id,
          access_pin_hash: pinHash,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'auth_user_id,customer_id' });
      } catch (authLinkErr) {
        console.warn('customer_auth_links non-blocking upsert warning:', authLinkErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        requiresVerification: isExistingAuthUser ? false : Boolean(email && password),
        email: email ? String(email).trim().toLowerCase() : undefined,
        phone: cleanPhone,
        simulatedOtp: generatedOtpCode,
        customer: {
          id: newCustomer.id,
          name: newCustomer.name,
          phoneNumber: newCustomer.phone_number,
          qrToken: newCustomer.qr_token,
          referralCode: newCustomer.referral_code,
          referredBy: newCustomer.referred_by,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/customer/signup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
