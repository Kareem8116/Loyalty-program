import { getServiceSupabase } from './supabase';
import { isFeatureEnabled } from './features';
import { notifyPointsAddedSms, notifyPointsRedeemedSms, notifyPointsExpiringSms } from './sms';

export interface NotificationPayload {
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

export interface NotificationResult {
  sent: boolean;
  bypassed: boolean;
  reason?: string;
  provider?: string;
  details?: any;
}

/**
 * In-memory test store for automated testing verification
 */
export const testNotificationLog: Array<{
  timestamp: string;
  businessId: string;
  customerId: string;
  type: string;
  phoneNumber?: string;
  message: string;
}> = [];

/**
 * Get notification settings for a business.
 */
export async function getBusinessNotificationSettings(businessId: string) {
  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('business_notification_settings')
      .select('id, business_id, provider, phone_number_id, access_token')
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch (err) {
    console.error('getBusinessNotificationSettings error:', err);
    return null;
  }
}

/**
 * Format message in Arabic according to event type.
 */
export function formatNotificationMessage(
  type: 'points_added' | 'points_redeemed' | 'points_expiring',
  data: NotificationPayload['data'],
  businessName?: string
): string {
  const biz = businessName ? ` من ${businessName}` : '';
  switch (type) {
    case 'points_added':
      return `تم إضافة ${data.pointsChange || 0} نقطة إلى حسابك${biz}. رصيدك الحالي: ${data.newBalance ?? 0} نقطة.`;
    case 'points_redeemed':
      return `تم استبدال ${Math.abs(data.pointsChange || 0)} نقطة من حسابك${biz}. رصيدك الحالي: ${data.newBalance ?? 0} نقطة.`;
    case 'points_expiring':
      return `تنبيه: لديك ${data.expiringPoints || 0} نقطة ستنتهي صلاحيتها خلال ${data.daysRemaining || 30} يومًا${biz}.`;
    default:
      return data.customMessage || 'إشعار جديد من برنامج نقاط الولاء.';
  }
}

/**
 * 16.8: Fail-Silent Notification Sender.
 * STRICT REQUIREMENT: Any failure (disabled feature, missing credentials, customer opt-out, network error)
 * MUST be handled silently and NEVER interrupt or fail the core transaction!
 */
export async function sendCustomerNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const { businessId, customerId, type, data } = payload;

  try {
    // 1. Check if notifications feature is enabled for this business (Phase 16.8)
    const isEnabled = await isFeatureEnabled(businessId, 'notifications');
    if (!isEnabled) {
      return {
        sent: false,
        bypassed: true,
        reason: 'FEATURE_DISABLED_FOR_BUSINESS',
      };
    }

    const adminClient = getServiceSupabase();

    // 2. Fetch customer details (phone_number, notifications_enabled, notification_channel)
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

    // 3. Check customer opt-out preference & notification_channel (Phase 16.9, 30.7 & RULES.md 3.1)
    if (customer.notifications_enabled === false) {
      return {
        sent: false,
        bypassed: true,
        reason: 'CUSTOMER_OPTED_OUT',
      };
    }

    const channel = (customer as any).notification_channel || 'all';
    if (channel === 'sms' || channel === 'none') {
      return {
        sent: false,
        bypassed: true,
        reason: 'CUSTOMER_CHANNEL_EXCLUDES_WHATSAPP',
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

    // 5. Fetch business notification credentials (Phase 16.2 & 16.8)
    const settings = await getBusinessNotificationSettings(businessId);
    if (!settings || !settings.provider) {
      return {
        sent: false,
        bypassed: true,
        reason: 'NO_NOTIFICATION_SETTINGS',
      };
    }

    const businessName = (customer as any).businesses?.name || '';
    const message = formatNotificationMessage(type, data, businessName);

    // 6. Send via configured provider
    if (settings.provider === 'mock' || process.env.NODE_ENV === 'test' || !settings.access_token) {
      // Mock / Test logging
      testNotificationLog.push({
        timestamp: new Date().toISOString(),
        businessId,
        customerId,
        type,
        phoneNumber,
        message,
      });

      return {
        sent: true,
        bypassed: false,
        provider: settings.provider || 'mock',
        details: { message, to: phoneNumber },
      };
    }

    if (settings.provider === 'whatsapp') {
      if (!settings.phone_number_id || !settings.access_token) {
        return {
          sent: false,
          bypassed: true,
          reason: 'INCOMPLETE_WHATSAPP_CREDENTIALS',
        };
      }

      // WhatsApp Cloud API Call (Fail-silent)
      const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
      const url = `https://graph.facebook.com/v20.0/${settings.phone_number_id}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: message },
        }),
      });

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.warn('WhatsApp Cloud API responded with error (fail-silent):', resData);
        return {
          sent: false,
          bypassed: true,
          reason: 'WHATSAPP_API_ERROR',
          details: resData,
        };
      }

      return {
        sent: true,
        bypassed: false,
        provider: 'whatsapp',
        details: resData,
      };
    }

    return {
      sent: false,
      bypassed: true,
      reason: `UNSUPPORTED_PROVIDER_${settings.provider}`,
    };
  } catch (error: any) {
    // Fail-silent: NEVER throw or block caller
    console.error('sendCustomerNotification error (fail-silent):', error);
    return {
      sent: false,
      bypassed: true,
      reason: 'UNEXPECTED_NOTIFICATION_ERROR',
      details: error?.message,
    };
  }
}

/**
 * 16.5 & 30.5: Send notification when points are added (non-blocking WhatsApp + SMS).
 */
export function notifyPointsAdded(
  businessId: string,
  customerId: string,
  pointsAdded: number,
  newBalance?: number
): void {
  // Fire and forget WhatsApp
  sendCustomerNotification({
    businessId,
    customerId,
    type: 'points_added',
    data: { pointsChange: pointsAdded, newBalance },
  }).catch((err) => console.error('notifyPointsAdded non-blocking error:', err));

  // Fire and forget SMS
  notifyPointsAddedSms(businessId, customerId, pointsAdded, newBalance);
}

/**
 * 16.6 & 30.5: Send notification when points are redeemed (non-blocking WhatsApp + SMS).
 */
export function notifyPointsRedeemed(
  businessId: string,
  customerId: string,
  pointsRedeemed: number,
  newBalance?: number
): void {
  // Fire and forget WhatsApp
  sendCustomerNotification({
    businessId,
    customerId,
    type: 'points_redeemed',
    data: { pointsChange: -Math.abs(pointsRedeemed), newBalance },
  }).catch((err) => console.error('notifyPointsRedeemed non-blocking error:', err));

  // Fire and forget SMS
  notifyPointsRedeemedSms(businessId, customerId, pointsRedeemed, newBalance);
}

/**
 * 16.7 & 30.5: Send notification when points are expiring (non-blocking WhatsApp + SMS).
 */
export function notifyPointsExpiring(
  businessId: string,
  customerId: string,
  expiringPoints: number,
  daysRemaining: number = 30
): void {
  // Fire and forget WhatsApp
  sendCustomerNotification({
    businessId,
    customerId,
    type: 'points_expiring',
    data: { expiringPoints, daysRemaining },
  }).catch((err) => console.error('notifyPointsExpiring non-blocking error:', err));

  // Fire and forget SMS
  notifyPointsExpiringSms(businessId, customerId, expiringPoints, daysRemaining);
}
