import { randomBytes, randomUUID } from 'crypto';
import { supabase, getServiceSupabase } from './supabase';
import { generateShortCode } from './shortcode';
import { isFeatureEnabled, getBusinessFeaturesWithDefs } from './features';
import { getCustomerTierInfo, CustomerTierInfo } from './tiers';
import { generateReferralCode, validateReferralCode, processReferralReward } from './referral';
import { BusinessBranding, DEFAULT_BRANDING } from './branding';

export interface CustomerData {
  id: string;
  business_id: string;
  name: string;
  phone_number?: string;
  qr_token: string;
  points_balance: number;
  business_name?: string;
  consent_given_at?: string | null;
  expiring_points_30d?: number;
  notifications_enabled?: boolean;
  business_notifications_active?: boolean;
  tier?: CustomerTierInfo | null;
  referral_code?: string;
  referred_by?: string | null;
  features?: Record<string, boolean>;
  branding?: Partial<BusinessBranding>;
  rates?: {
    points_per_currency_unit: number;
    currency_per_point: number;
  };
  created_at: string;
}

// Crockford's clean Base32 alphabet: eliminates 0/O, 1/I/L to avoid human confusion
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * 3.1 & Phase 25: Generate a 9-character alphanumeric code for the customer.
 * Mix of uppercase letters and numbers, clean and easy to read/type without confusion.
 */
export function generateQrToken(): string {
  const bytes = randomBytes(9);
  let token = '';
  for (let i = 0; i < 9; i++) {
    token += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return token;
}

export { extractCustomerToken } from './tokens';
import { extractCustomerToken } from './tokens';

/**
 * Calculate customer points balance from points_ledger.
 * RULES.md line 30: points_ledger is the single source of truth.
 * Current balance is computed from the sum of transaction records.
 */
export async function getCustomerPointsBalance(customerId: string, businessId?: string): Promise<number> {
  const adminClient = getServiceSupabase();
  let query = adminClient
    .from('points_ledger')
    .select('points_change')
    .eq('customer_id', customerId);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('Error fetching points ledger:', error);
    return 0;
  }

  return data.reduce((sum, entry) => sum + (entry.points_change || 0), 0);
}

/**
 * 21.2: Check if a phone number is already registered for a specific business.
 * Phone numbers are unique PER BUSINESS (a customer may register at different businesses).
 */
export async function checkCustomerPhoneExists(
  businessId: string,
  phoneNumber: string
): Promise<{ exists: boolean; customerId?: string; qrToken?: string }> {
  if (!businessId || !phoneNumber || !phoneNumber.trim()) {
    return { exists: false };
  }

  const cleanPhone = phoneNumber.trim();
  const adminClient = getServiceSupabase();

  const { data, error } = await adminClient
    .from('customers')
    .select('id, qr_token')
    .eq('business_id', businessId)
    .eq('phone_number', cleanPhone)
    .maybeSingle();

  if (error || !data) {
    return { exists: false };
  }

  return {
    exists: true,
    customerId: data.id,
    qrToken: data.qr_token,
  };
}

/**
 * 3.1, 13.3 & 19.2: Create a new customer with unique qr_token, consent, and referral code.
 */
export async function createCustomer(params: {
  businessId: string;
  name: string;
  phoneNumber: string;
  qrToken?: string;
  consentGiven?: boolean;
  referralCode?: string;
}) {
  if (!params.consentGiven) {
    throw new Error('Customer consent is required to register and collect personal data.');
  }

  const adminClient = getServiceSupabase();
  const token = params.qrToken || generateQrToken();
  const consentGivenAt = new Date().toISOString();
  const newReferralCode = generateReferralCode();

  // Validate referrer if referralCode provided (19.4)
  let referrerId: string | null = null;
  if (params.referralCode && params.referralCode.trim()) {
    const referrer = await validateReferralCode(params.businessId, params.referralCode.trim());
    if (referrer) {
      referrerId = referrer.id;
    }
  }

  const { data, error } = await adminClient
    .from('customers')
    .insert({
      business_id: params.businessId,
      name: params.name,
      phone_number: params.phoneNumber,
      qr_token: token,
      consent_given_at: consentGivenAt,
      notifications_enabled: true,
      referral_code: newReferralCode,
      referred_by: referrerId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create customer: ${error.message}`);
  }

  // Phase 26: Generate and persist short_code (Sqids, collision-free)
  if (data?.id) {
    try {
      const shortCode = generateShortCode(data.id);
      await adminClient
        .from('customers')
        .update({ short_code: shortCode })
        .eq('id', data.id);
      (data as any).short_code = shortCode;
    } catch (scErr) {
      console.warn('[customer] Failed to generate short_code (non-fatal):', scErr);
    }
  }

  // 19.4: Process referral reward for both referrer and referee
  if (referrerId && data?.id) {
    try {
      await processReferralReward({
        businessId: params.businessId,
        referrerId,
        refereeId: data.id,
      });
    } catch (rewardErr) {
      console.error('Failed to award referral points:', rewardErr);
    }
  }

  return data;
}

/**
 * 3.2: Get customer details by qr_token.
 * Masks or omits phone_number if requester is cashier (or unprivileged).
 */
export async function getCustomerByQrToken(
  qrToken: string,
  requesterRole?: string | null
): Promise<CustomerData | null> {
  const adminClient = getServiceSupabase();

  const cleanToken = extractCustomerToken(qrToken);

  // Fetch customer along with business details (try exact qr_token, then uppercase, then short_code)
  const SELECT_FIELDS = `
      id,
      business_id,
      name,
      phone_number,
      qr_token,
      short_code,
      referral_code,
      referred_by,
      notifications_enabled,
      created_at,
      businesses (name)
    `;

  let { data: customer, error } = await adminClient
    .from('customers')
    .select(SELECT_FIELDS)
    .eq('qr_token', cleanToken)
    .maybeSingle();

  if (!customer && cleanToken.length === 9) {
    // Try uppercase qr_token
    const { data: upperCustomer } = await adminClient
      .from('customers')
      .select(SELECT_FIELDS)
      .eq('qr_token', cleanToken.toUpperCase())
      .maybeSingle();
    customer = upperCustomer;
  }

  // Phase 26: Fallback — lookup by short_code (9-char Sqids code)
  if (!customer && cleanToken.length >= 9 && cleanToken.length <= 12) {
    const { data: shortCodeCustomer } = await adminClient
      .from('customers')
      .select(SELECT_FIELDS)
      .eq('short_code', cleanToken.toUpperCase())
      .maybeSingle();
    customer = shortCodeCustomer;
  }

  if (error || !customer) {
    return null;
  }

  // Calculate points balance dynamically from points_ledger
  const points_balance = await getCustomerPointsBalance(customer.id);

  // PLAN.md 3.2: omit phone_number if requester is cashier
  const isPrivileged = requesterRole === 'owner' || requesterRole === 'super_admin';
  const phoneNumber = isPrivileged ? customer.phone_number : undefined;

  let businessName = (customer as any).businesses?.name || 'Pointat';

  // 14.4: Calculate points expiring within the next 30 days
  let expiring_points_30d = 0;
  if (points_balance > 0) {
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const { data: upcomingExpiring } = await adminClient
      .from('points_ledger')
      .select('points_change')
      .eq('customer_id', customer.id)
      .gt('points_change', 0)
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', in30Days.toISOString());

    if (upcomingExpiring && upcomingExpiring.length > 0) {
      const sumExpiring = upcomingExpiring.reduce((sum, r) => sum + (r.points_change || 0), 0);
      expiring_points_30d = Math.min(points_balance, sumExpiring);
    }
  }

  // Phase 22.8: Fetch business features to conditionally render UI components
  let features: Record<string, boolean> = {};
  try {
    const featureData = await getBusinessFeaturesWithDefs(customer.business_id);
    features = featureData.features;
  } catch (featErr) {
    console.warn('getBusinessFeaturesWithDefs non-blocking error:', featErr);
  }

  // Phase 22.8: If points expiry is disabled for this business, do not show expiry alert
  if (features.points_expiry === false) {
    expiring_points_30d = 0;
  }

  // 16.9 & Phase 30: Check whether notifications (WhatsApp or SMS) feature is active for this business
  const business_notifications_active = (features.notifications ?? false) || (features.sms_notifications ?? false);

  // 17.3: Dynamically compute customer membership tier (only if feature is enabled)
  let tier: CustomerTierInfo | null = null;
  if (features.membership_tiers !== false) {
    try {
      tier = await getCustomerTierInfo(customer.id, customer.business_id);
    } catch (tierErr) {
      console.warn('getCustomerTierInfo non-blocking error:', tierErr);
    }
  }

  // Phase 9.5 & 9.6: Fetch business branding
  let branding: Partial<BusinessBranding> = { ...DEFAULT_BRANDING };
  try {
    const { data: bData } = await adminClient
      .from('business_branding')
      .select('*')
      .eq('business_id', customer.business_id)
      .maybeSingle();

    if (bData) {
      branding = bData;
      if (bData.display_name?.trim()) {
        businessName = bData.display_name.trim();
      }
    }
  } catch (brandingErr) {
    console.warn('business_branding fetch non-blocking error:', brandingErr);
  }

  // Fetch redemption rates to show monetary value of points to customer
  let rates = { points_per_currency_unit: 1.0, currency_per_point: 0.1 };
  try {
    const { data: rateData } = await adminClient
      .from('redemption_rates')
      .select('points_per_currency_unit, currency_per_point')
      .eq('business_id', customer.business_id)
      .maybeSingle();

    if (rateData) {
      rates = {
        points_per_currency_unit: Number(rateData.points_per_currency_unit) || 1.0,
        currency_per_point: Number(rateData.currency_per_point) || 0.1,
      };
    }
  } catch (ratesErr) {
    console.warn('redemption_rates fetch non-blocking error:', ratesErr);
  }

  return {
    id: customer.id,
    business_id: customer.business_id,
    name: customer.name,
    phone_number: phoneNumber,
    qr_token: customer.qr_token,
    points_balance,
    expiring_points_30d,
    notifications_enabled: customer.notifications_enabled !== false,
    business_notifications_active,
    tier,
    referral_code: customer.referral_code,
    referred_by: customer.referred_by,
    features,
    branding,
    rates,
    business_name: businessName,
    created_at: customer.created_at,
  };
}
