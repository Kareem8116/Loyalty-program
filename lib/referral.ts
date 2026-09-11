import { getServiceSupabase } from './supabase';
import { isFeatureEnabled } from './features';
import { recordPointsTransaction } from './cashier';

export interface ReferralSettings {
  businessId: string;
  referrerRewardPoints: number;
  refereeRewardPoints: number;
}

const REFERRAL_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates a user-friendly, unique uppercase referral code (e.g. REF-K8P9M2)
 */
export function generateReferralCode(): string {
  let code = 'REF-';
  for (let i = 0; i < 6; i++) {
    const randIndex = Math.floor(Math.random() * REFERRAL_CHARS.length);
    code += REFERRAL_CHARS[randIndex];
  }
  return code;
}

/**
 * 19.3: Get referral reward points settings for a business.
 * Defaults to 50 for referrer and 25 for referee if not configured yet.
 */
export async function getReferralSettings(businessId: string): Promise<ReferralSettings> {
  const adminClient = getServiceSupabase();

  const { data, error } = await adminClient
    .from('referral_settings')
    .select('referrer_reward_points, referee_reward_points')
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) {
    return {
      businessId,
      referrerRewardPoints: 50,
      refereeRewardPoints: 25,
    };
  }

  return {
    businessId,
    referrerRewardPoints: data.referrer_reward_points,
    refereeRewardPoints: data.referee_reward_points,
  };
}

/**
 * 19.3: Update or create referral reward points settings for a business.
 */
export async function updateReferralSettings(
  businessId: string,
  settings: { referrerRewardPoints: number; refereeRewardPoints: number }
): Promise<ReferralSettings> {
  const adminClient = getServiceSupabase();

  const { data, error } = await adminClient
    .from('referral_settings')
    .upsert(
      {
        business_id: businessId,
        referrer_reward_points: Math.max(0, Math.floor(settings.referrerRewardPoints)),
        referee_reward_points: Math.max(0, Math.floor(settings.refereeRewardPoints)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update referral settings: ${error?.message}`);
  }

  return {
    businessId,
    referrerRewardPoints: data.referrer_reward_points,
    refereeRewardPoints: data.referee_reward_points,
  };
}

/**
 * 19.4: Validate that a referral code exists within the target business.
 */
export async function validateReferralCode(
  businessId: string,
  rawCode: string
): Promise<{ id: string; name: string; business_id: string } | null> {
  if (!rawCode || !rawCode.trim()) return null;

  const normalizedCode = rawCode.trim().toUpperCase();
  const adminClient = getServiceSupabase();

  const { data, error } = await adminClient
    .from('customers')
    .select('id, name, business_id')
    .eq('business_id', businessId)
    .ilike('referral_code', normalizedCode)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * 19.4: Process referral rewards for both referrer and referee.
 * Strictly adheres to Single Source of Truth by recording transactions in points_ledger.
 */
export async function processReferralReward(params: {
  businessId: string;
  referrerId: string;
  refereeId: string;
  client?: any;
}): Promise<{ success: boolean; referrerPoints: number; refereePoints: number }> {
  // Prevent self-referral
  if (params.referrerId === params.refereeId) {
    throw new Error('Self-referral is not allowed');
  }

  // Check if referral_program feature is enabled for this business
  const isEnabled = await isFeatureEnabled(params.businessId, 'referral_program');
  if (!isEnabled) {
    return { success: false, referrerPoints: 0, refereePoints: 0 };
  }

  const settings = await getReferralSettings(params.businessId);

  // 1. Award points to Referrer
  if (settings.referrerRewardPoints > 0) {
    await recordPointsTransaction({
      businessId: params.businessId,
      customerId: params.referrerId,
      pointsChange: settings.referrerRewardPoints,
      reason: 'referral',
      client: params.client,
    });
  }

  // 2. Award points to Referee
  if (settings.refereeRewardPoints > 0) {
    await recordPointsTransaction({
      businessId: params.businessId,
      customerId: params.refereeId,
      pointsChange: settings.refereeRewardPoints,
      reason: 'referral',
      client: params.client,
    });
  }

  return {
    success: true,
    referrerPoints: settings.referrerRewardPoints,
    refereePoints: settings.refereeRewardPoints,
  };
}
