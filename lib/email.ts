/**
 * lib/email.ts
 * Phase 29: Pointat Email Sending Engine via Resend REST API
 * 
 * Features:
 * 1. Zero dependencies: Uses native fetch to call Resend API.
 * 2. Premium branded responsive HTML email template for Pointat OTP verification.
 * 3. Fail-silent error handling with rich server logging.
 */

import nodemailer, { type Transporter } from 'nodemailer';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Pointat <onboarding@resend.dev>';

let transporter: Transporter | null = null;

function getMailTransporter() {
  if (!transporter && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends an email using Gmail SMTP (if configured) or Resend REST API
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<SendEmailResult> {
  // 1. Try Gmail SMTP if configured (Allows sending to ANY recipient with 0 domain requirement)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const mailer = getMailTransporter();
      if (mailer) {
        const fromName = 'Pointat Loyalty • نظام الولاء';
        const from = `"${fromName}" <${process.env.SMTP_USER}>`;
        const info = await mailer.sendMail({
          from,
          to: to.trim().toLowerCase(),
          subject,
          html,
          text: text || undefined,
        });
        console.log(`[Email] Successfully delivered via Gmail SMTP to ${to}:`, info.messageId);
        return {
          success: true,
          messageId: info.messageId,
        };
      }
    } catch (smtpErr: any) {
      console.error('[Email] Gmail SMTP delivery failed, attempting Resend fallback:', smtpErr);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[Email] Neither SMTP nor RESEND_API_KEY is configured in environment.');
    return {
      success: false,
      error: 'EMAIL_SERVICE_NOT_CONFIGURED',
    };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM_EMAIL,
        to: [to],
        subject,
        html,
        text: text || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[Email] Resend API error response:', {
        status: res.status,
        data,
      });
      return {
        success: false,
        error: data.message || `HTTP ${res.status}: Failed to send email`,
      };
    }

    return {
      success: true,
      messageId: data.id,
    };
  } catch (err: any) {
    console.error('[Email] Network error while calling Resend:', err);
    return {
      success: false,
      error: err.message || 'Network error',
    };
  }
}

/**
 * Generates the responsive HTML email template for Pointat 6-digit OTP verification
 */
export function generateOtpEmailHtml(otpCode: string, recipientName?: string): string {
  const greeting = recipientName ? `مرحباً ${recipientName}،` : 'مرحباً بك،';

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رمز التحقق من البريد الإلكتروني - Pointat</title>
</head>
<body style="margin: 0; padding: 0; background-color: #070612; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FAF7F2; text-align: right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #070612; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #100E1C; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 36px 28px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
          
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="width: 52px; height: 52px; background: linear-gradient(135deg, #6C63FF, #4ECDC4); border-radius: 16px; font-size: 24px; color: #FFFFFF; font-weight: bold; line-height: 52px; text-align: center; box-shadow: 0 8px 20px rgba(108,99,255,0.35);">
                    ★
                  </td>
                </tr>
              </table>
              <h2 style="margin: 14px 0 4px 0; font-size: 22px; font-weight: 800; color: #FAF7F2; letter-spacing: -0.5px;">
                Pointat • بـويـنـتـات
              </h2>
              <p style="margin: 0; font-size: 12px; color: rgba(250,247,242,0.5); font-weight: 500;">
                منظومة الولاء والمكافآت الذكية
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 24px;">
              <p style="margin: 0 0 12px 0; font-size: 15px; color: #FAF7F2; font-weight: 600;">
                ${greeting}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 1.6; color: rgba(250,247,242,0.75);">
                لتفعيل حسابك وحماية أمان وصولك، يرجى استخدام رمز التحقق المؤقت (OTP) أدناه لإتمام عملية تفعيل البريد الإلكتروني:
              </p>
            </td>
          </tr>

          <!-- OTP Code Box -->
          <tr>
            <td align="center" style="padding: 12px 0 24px 0;">
              <div style="background: rgba(108, 99, 255, 0.08); border: 2px dashed rgba(108, 99, 255, 0.4); border-radius: 16px; padding: 20px 24px; display: inline-block;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #A5B4FC; text-shadow: 0 0 16px rgba(108,99,255,0.4);">
                  ${otpCode}
                </span>
              </div>
            </td>
          </tr>

          <!-- Expiry Notice -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.25); border-radius: 10px; padding: 8px 14px;">
                <tr>
                  <td style="font-size: 12px; color: #FCA5A5; font-weight: 600;">
                    ⏱️ صلاحية هذا الرمز تنتهي خلال 10 دقائق فقط
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security Advisory -->
          <tr>
            <td style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
              <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.5; color: rgba(250,247,242,0.45);">
                ⚠️ تنبيه أمني: لا تشارك هذا الرمز مع أي شخص. موظفو Pointat لن يطلبوا منك رمز التحقق الخاص بك مطلقاً.
              </p>
              <p style="margin: 0; font-size: 11px; line-height: 1.5; color: rgba(250,247,242,0.45);">
                إذا لم تكن قد طلبت هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان دون اتخاذ أي إجراء.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 28px;">
              <p style="margin: 0; font-size: 11px; color: rgba(250,247,242,0.3);">
                © ${new Date().getFullYear()} Pointat Loyalty Platform. جميع الحقوق محفوظة.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Phase 29 helper to send a branded verification OTP email
 */
export async function sendVerificationOtpEmail(
  toEmail: string,
  otpCode: string,
  recipientName?: string
): Promise<SendEmailResult> {
  const subject = `رمز التحقق الخاص بك في Pointat: [ ${otpCode} ]`;
  const html = generateOtpEmailHtml(otpCode, recipientName);
  const text = `رمز التحقق الخاص بك في Pointat هو: ${otpCode}\n\nصلاحية هذا الرمز 10 دقائق فقط. لا تشاركه مع أي شخص.`;

  return sendEmail({
    to: toEmail.trim().toLowerCase(),
    subject,
    html,
    text,
  });
}
