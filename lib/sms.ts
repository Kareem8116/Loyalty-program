/**
 * lib/sms.ts
 * Phase 30: Pointat SMS Notifications Engine
 * 
 * Features:
 * 1. Twilio REST API integration & Built-in Mock/Sandbox Provider.
 * 2. Fail-Silent Execution (Phase 30.6): SMS failures NEVER interrupt or fail transactions.
 * 3. Channel Preference Check (Phase 30.7): Honors customer's preferred channel ('all' | 'whatsapp' | 'sms' | 'none').
 * 4. Resilient Fallback: Safe fallback if table is pending migration.
 */

import { getServiceSupabase } from './supabase';
import { isFeatureEnabled } from './features';

export interface SmsPayload {
  businessId: string;
  customerId: string;
  type: 'points_added' | 'points_redeemed' | 'points_expiring';
  data: {
    pointsChange?: number;
    newBalance?: number;
    expiringPoints?: number;
    daysRemaining?: number;
    customMessage?: string;
  };
}

export interface SmsResult {
  sent: boolean;
  bypassed: boolean;
  reason?: string;
  provider?: string;
  details?: any;
}

export interface BusinessSmsSettings {
  id?: string;
  business_id: string;
  provider: 'mock' | 'twilio';
  account_sid?: string | null;
  auth_token?: string | null;
  sender_id?: string | null;
}

/**
 * In-memory test store for automated testing verification & sandbox mode
 */
export const testSmsLog: Array<{
  timestamp: string;
  businessId: string;
  customerId: string;
  type: string;
  phoneNumber?: string;
  message: string;
  provider: string;
}> = [];

// In-memory fallback settings if DB table is pending migration
const memorySmsSettings = new Map<string, BusinessSmsSettings>();

/**
 * Get SMS settings for a business (DB or in-memory fallback)
 */
export async function getBusinessSmsSettings(businessId: string): Promise<BusinessSmsSettings | null> {
  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('business_sms_settings')
      .select('id, business_id, provider, account_sid, auth_token, sender_id')
      .eq('business_id', businessId)
      .maybeSingle();

    if (!error && data) {
      return data as BusinessSmsSettings;
    }
  } catch (err) {
    console.warn('[SMS] Error fetching business_sms_settings, falling back:', err);
  }

  return memorySmsSettings.get(businessId) || {
    business_id: businessId,
    provider: 'mock',
    sender_id: 'Pointat',
  };
}

/**
 * Update SMS settings for a business (DB + in-memory sync)
 */
export async function updateBusinessSmsSettings(settings: BusinessSmsSettings): Promise<{ success: boolean; error?: string }> {
  // Always update memory store
  memorySmsSettings.set(settings.business_id, settings);

  try {
    const adminClient = getServiceSupabase();
    const { error } = await adminClient
      .from('business_sms_settings')
      .upsert({
        business_id: settings.business_id,
        provider: settings.provider,
        account_sid: settings.account_sid || null,
        auth_token: settings.auth_token || null,
        sender_id: settings.sender_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id' });

    if (error) {
      console.warn('[SMS] Warning saving to business_sms_settings table (table may be pending migration):', error.message);
    }
    return { success: true };
  } catch (err: any) {
    console.warn('[SMS] Non-blocking warning on updateBusinessSmsSettings:', err);
    return { success: true };
  }
}

/**
 * Format concise Arabic SMS message (optimized for 160-character limits)
 */
export function formatSmsMessage(
  type: 'points_added' | 'points_redeemed' | 'points_expiring',
  data: SmsPayload['data'],
  businessName?: string
): string {
  const biz = businessName ? ` من ${businessName}` : '';
  switch (type) {
    case 'points_added':
      return `Pointat: تم إضافة ${data.pointsChange || 0} نقطة لرصيدك${biz}. رصيدك الحالي: ${data.newBalance ?? 0} نقطة.`;
    case 'points_redeemed':
      return `Pointat: تم استبدال ${Math.abs(data.pointsChange || 0)} نقطة من حسابك${biz}. رصيدك الحالي: ${data.newBalance ?? 0} نقطة.`;
    case 'points_expiring':
      return `Pointat: تنبيه: ${data.expiringPoints || 0} نقطة ستنتهي صلاحيتها خلال ${data.daysRemaining || 30} يومًا${biz}.`;
    default:
      return data.customMessage || 'Pointat: إشعار جديد من برنامج نقاط الولاء.';
  }
}

/**
 * 30.6: Fail-Silent SMS Notification Sender.
 * STRICT REQUIREMENT: Any failure (disabled feature, missing credentials, customer opt-out, network error)
 * MUST be handled silently and NEVER interrupt or fail the core transaction!
 */
export async function sendCustomerSms(payload: SmsPayload): Promise<SmsResult> {
  const { businessId, customerId, type, data } = payload;

  try {
    // 1. Check if sms_notifications feature is enabled for this business (Phase 30.6)
    const isEnabled = await isFeatureEnabled(businessId, 'sms_notifications');
    if (!isEnabled) {
      return {
        sent: false,
        bypassed: true,
        reason: 'FEATURE_DISABLED_FOR_BUSINESS',
      };
    }

    const adminClient = getServiceSupabase();

    // 2. Fetch customer details
    const { data: customer, error: custErr } = await adminClient
      .from('customers')
      .select('id, name, phone_number, notifications_enabled, notification_channel, businesses(name)')
      .eq('id', customerId)
      .maybeSingle();

    if (custErr || !customer) {
      return {
        sent: false,
        bypassed: true,
        reason: 'CUSTOMER_NOT_FOUND',
      };
    }

    // 3. Check customer opt-out preference & notification_channel (Phase 30.7)
    if (customer.notifications_enabled === false) {
      return {
        sent: false,
        bypassed: true,
        reason: 'CUSTOMER_OPTED_OUT',
      };
    }

    const channel = (customer as any).notification_channel || 'all';
    if (channel === 'whatsapp' || channel === 'none') {
      return {
        sent: false,
        bypassed: true,
        reason: 'CUSTOMER_CHANNEL_EXCLUDES_SMS',
      };
    }

    // 4. Verify valid phone number
    const phoneNumber = customer.phone_number?.replace(/[^0-9+]/g, '');
    if (!phoneNumber || phoneNumber.length < 8) {
      return {
        sent: false,
        bypassed: true,
        reason: 'INVALID_PHONE_NUMBER',
      };
    }

    // Normalize Egyptian numbers for international SMS (e.g., 010 -> +2010)
    let formattedPhone = phoneNumber;
    if (formattedPhone.startsWith('01') && formattedPhone.length === 11) {
      formattedPhone = `+20${formattedPhone.slice(1)}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    // 5. Fetch business SMS settings (Phase 30.2)
    const settings = await getBusinessSmsSettings(businessId);
    if (!settings || !settings.provider) {
      return {
        sent: false,
        bypassed: true,
        reason: 'NO_SMS_SETTINGS',
      };
    }

    const businessName = (customer as any).businesses?.name || '';
    const message = formatSmsMessage(type, data, businessName);

    // 6. Send via configured provider
    if (settings.provider === 'mock' || process.env.NODE_ENV === 'test' || !settings.account_sid) {
      // Mock / Sandbox provider (zero cost, immediate testing)
      testSmsLog.push({
        timestamp: new Date().toISOString(),
        businessId,
        customerId,
        type,
        phoneNumber: formattedPhone,
        message,
        provider: 'mock',
      });

      return {
        sent: true,
        bypassed: false,
        provider: 'mock',
        details: { message, to: formattedPhone },
      };
    }

    if (settings.provider === 'twilio') {
      if (!settings.account_sid || !settings.auth_token) {
        return {
          sent: false,
          bypassed: true,
          reason: 'INCOMPLETE_TWILIO_CREDENTIALS',
        };
      }

      // Twilio Messages REST API Call (Fail-silent)
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.account_sid}/Messages.json`;
      const basicAuth = Buffer.from(`${settings.account_sid}:${settings.auth_token}`).toString('base64');

      const formData = new URLSearchParams();
      formData.append('To', formattedPhone);
      formData.append('From', settings.sender_id || 'Pointat');
      formData.append('Body', message);

      const twilioRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const resData = await twilioRes.json().catch(() => ({}));

      if (!twilioRes.ok) {
        console.warn('[SMS] Twilio API responded with error (fail-silent):', resData);
        return {
          sent: false,
          bypassed: true,
          reason: 'TWILIO_API_ERROR',
          details: resData,
        };
      }

      return {
        sent: true,
        bypassed: false,
        provider: 'twilio',
        details: { sid: resData.sid, to: formattedPhone },
      };
    }

    return {
      sent: false,
      bypassed: true,
      reason: 'UNKNOWN_PROVIDER',
    };
  } catch (err: any) {
    // Phase 30.6: STRICT fail-silent protection
    console.error('[SMS] sendCustomerSms error (fail-silent):', err);
    return {
      sent: false,
      bypassed: true,
      reason: 'INTERNAL_ERROR',
      details: err.message,
    };
  }
}

/**
 * Send SMS when points are added (non-blocking).
 */
export function notifyPointsAddedSms(
  businessId: string,
  customerId: string,
  pointsAdded: number,
  newBalance?: number
): void {
  sendCustomerSms({
    businessId,
    customerId,
    type: 'points_added',
    data: { pointsChange: pointsAdded, newBalance },
  }).catch((err) => console.error('[SMS] notifyPointsAddedSms non-blocking error:', err));
}

/**
 * Send SMS when points are redeemed (non-blocking).
 */
export function notifyPointsRedeemedSms(
  businessId: string,
  customerId: string,
  pointsRedeemed: number,
  newBalance?: number
): void {
  sendCustomerSms({
    businessId,
    customerId,
    type: 'points_redeemed',
    data: { pointsChange: -Math.abs(pointsRedeemed), newBalance },
  }).catch((err) => console.error('[SMS] notifyPointsRedeemedSms non-blocking error:', err));
}

/**
 * Send SMS when points are expiring (non-blocking).
 */
export function notifyPointsExpiringSms(
  businessId: string,
  customerId: string,
  expiringPoints: number,
  daysRemaining: number = 30
): void {
  sendCustomerSms({
    businessId,
    customerId,
    type: 'points_expiring',
    data: { expiringPoints, daysRemaining },
  }).catch((err) => console.error('[SMS] notifyPointsExpiringSms non-blocking error:', err));
}

/**
 * Generic fail-silent direct SMS sender (e.g. for owner offline failure alerts)
 */
export async function sendSms(params: {
  businessId: string;
  to: string;
  text: string;
}): Promise<SmsResult> {
  const { businessId, to, text } = params;
  try {
    const isEnabled = await isFeatureEnabled(businessId, 'sms_notifications');
    if (!isEnabled) {
      return { sent: false, bypassed: true, reason: 'FEATURE_DISABLED' };
    }

    const phoneNumber = to.replace(/[^0-9+]/g, '');
    if (!phoneNumber || phoneNumber.length < 8) {
      return { sent: false, bypassed: true, reason: 'INVALID_PHONE_NUMBER' };
    }

    let formattedPhone = phoneNumber;
    if (formattedPhone.startsWith('01') && formattedPhone.length === 11) {
      formattedPhone = `+20${formattedPhone.slice(1)}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    const settings = await getBusinessSmsSettings(businessId);
    if (!settings || !settings.provider) {
      return { sent: false, bypassed: true, reason: 'NO_SMS_SETTINGS' };
    }

    if (settings.provider === 'mock' || process.env.NODE_ENV === 'test' || !settings.account_sid) {
      testSmsLog.push({
        timestamp: new Date().toISOString(),
        businessId,
        customerId: 'owner',
        type: 'custom_alert',
        phoneNumber: formattedPhone,
        message: text,
        provider: 'mock',
      });
      return { sent: true, bypassed: false, provider: 'mock', details: { message: text, to: formattedPhone } };
    }

    if (settings.provider === 'twilio') {
      if (!settings.account_sid || !settings.auth_token) {
        return { sent: false, bypassed: true, reason: 'INCOMPLETE_TWILIO_CREDENTIALS' };
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.account_sid}/Messages.json`;
      const basicAuth = Buffer.from(`${settings.account_sid}:${settings.auth_token}`).toString('base64');
      const formData = new URLSearchParams();
      formData.append('To', formattedPhone);
      formData.append('From', settings.sender_id || 'Pointat');
      formData.append('Body', text);

      const twilioRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const resData = await twilioRes.json().catch(() => ({}));
      if (!twilioRes.ok) {
        return { sent: false, bypassed: true, reason: 'TWILIO_API_ERROR', details: resData };
      }
      return { sent: true, bypassed: false, provider: 'twilio', details: { sid: resData.sid, to: formattedPhone } };
    }

    return { sent: false, bypassed: true, reason: 'UNKNOWN_PROVIDER' };
  } catch (err: any) {
    console.error('[SMS] sendSms fail-silent error:', err);
    return { sent: false, bypassed: true, reason: 'INTERNAL_ERROR', details: err.message };
  }
}

