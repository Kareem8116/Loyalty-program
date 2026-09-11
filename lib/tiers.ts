import { getServiceSupabase } from './supabase';

export interface MembershipTier {
  id: string;
  business_id: string;
  name: string;
  min_points_earned: number;
  benefits_description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerTierInfo {
  lifetimeEarnedPoints: number;
  currentTier: {
    id?: string;
    name: string;
    min_points_earned: number;
    benefits_description?: string | null;
  };
  nextTier?: {
    id?: string;
    name: string;
    min_points_earned: number;
    benefits_description?: string | null;
  } | null;
  pointsToNextTier: number;
  progressPercent: number;
}

/**
 * 17.3 & RULES.md 3.1: Calculate total lifetime points earned by a customer.
 * MUST be derived strictly from points_ledger records where points_change > 0.
 * Redemptions and point expirations do NOT reduce lifetime earned points for tier qualification.
 */
export async function getLifetimeEarnedPoints(customerId: string, businessId?: string): Promise<number> {
  const adminClient = getServiceSupabase();
  let query = adminClient
    .from('points_ledger')
    .select('points_change')
    .eq('customer_id', customerId)
    .gt('points_change', 0);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('getLifetimeEarnedPoints error:', error);
    return 0;
  }

  return data.reduce((sum, row) => sum + (Number(row.points_change) || 0), 0);
}

/**
 * Fetch all tiers for a business ordered ascending by min_points_earned.
 */
export async function getBusinessTiers(businessId: string): Promise<MembershipTier[]> {
  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('membership_tiers')
      .select('id, business_id, name, min_points_earned, benefits_description, created_at, updated_at')
      .eq('business_id', businessId)
      .order('min_points_earned', { ascending: true });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error('getBusinessTiers error:', err);
    return [];
  }
}

/**
 * 17.3: Dynamically compute customer tier, next tier, and upgrade progress.
 */
export async function getCustomerTierInfo(customerId: string, businessId: string): Promise<CustomerTierInfo | null> {
  const [lifetimeEarnedPoints, tiers] = await Promise.all([
    getLifetimeEarnedPoints(customerId, businessId),
    getBusinessTiers(businessId),
  ]);

  if (!tiers || tiers.length === 0) {
    return null;
  }

  // Tiers are sorted ascending by min_points_earned
  // Current tier is the highest tier whose threshold is <= lifetimeEarnedPoints
  let currentTier: MembershipTier = tiers[0];
  for (const tier of tiers) {
    if (lifetimeEarnedPoints >= tier.min_points_earned) {
      currentTier = tier;
    } else {
      break;
    }
  }

  // Next tier is the first tier whose threshold is > lifetimeEarnedPoints
  const nextTier = tiers.find((t) => t.min_points_earned > lifetimeEarnedPoints) || null;

  let pointsToNextTier = 0;
  let progressPercent = 100;

  if (nextTier) {
    pointsToNextTier = Math.max(0, nextTier.min_points_earned - lifetimeEarnedPoints);
    const range = nextTier.min_points_earned - currentTier.min_points_earned;
    const gainedInRange = lifetimeEarnedPoints - currentTier.min_points_earned;
    if (range > 0) {
      progressPercent = Math.min(100, Math.max(0, Math.round((gainedInRange / range) * 100)));
    } else {
      progressPercent = 0;
    }
  }

  return {
    lifetimeEarnedPoints,
    currentTier: {
      id: currentTier.id,
      name: currentTier.name,
      min_points_earned: currentTier.min_points_earned,
      benefits_description: currentTier.benefits_description,
    },
    nextTier: nextTier
      ? {
          id: nextTier.id,
          name: nextTier.name,
          min_points_earned: nextTier.min_points_earned,
          benefits_description: nextTier.benefits_description,
        }
      : null,
    pointsToNextTier,
    progressPercent,
  };
}

/**
 * Create a new membership tier.
 */
export async function createBusinessTier(params: {
  businessId: string;
  name: string;
  minPointsEarned: number;
  benefitsDescription?: string | null;
}): Promise<MembershipTier> {
  const adminClient = getServiceSupabase();
  const { data, error } = await adminClient
    .from('membership_tiers')
    .insert({
      business_id: params.businessId,
      name: params.name.trim(),
      min_points_earned: Math.max(0, params.minPointsEarned),
      benefits_description: params.benefitsDescription?.trim() || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create tier: ${error?.message}`);
  }

  return data;
}

/**
 * Update an existing tier.
 */
export async function updateBusinessTier(
  tierId: string,
  businessId: string,
  params: {
    name?: string;
    minPointsEarned?: number;
    benefitsDescription?: string | null;
  }
): Promise<MembershipTier> {
  const adminClient = getServiceSupabase();
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) payload.name = params.name.trim();
  if (params.minPointsEarned !== undefined) payload.min_points_earned = Math.max(0, params.minPointsEarned);
  if (params.benefitsDescription !== undefined) payload.benefits_description = params.benefitsDescription?.trim() || null;

  const { data, error } = await adminClient
    .from('membership_tiers')
    .update(payload)
    .eq('id', tierId)
    .eq('business_id', businessId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update tier: ${error?.message}`);
  }

  return data;
}

/**
 * Delete a membership tier.
 */
export async function deleteBusinessTier(tierId: string, businessId: string): Promise<boolean> {
  const adminClient = getServiceSupabase();
  const { error } = await adminClient
    .from('membership_tiers')
    .delete()
    .eq('id', tierId)
    .eq('business_id', businessId);

  if (error) {
    throw new Error(`Failed to delete tier: ${error.message}`);
  }

  return true;
}
