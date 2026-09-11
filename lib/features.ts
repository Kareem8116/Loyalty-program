import { NextResponse } from 'next/server';
import { getServiceSupabase } from './supabase';
import { clearTenantCache } from './tenant';

export interface FeatureDefinition {
  key: string;
  name: string;
  description: string;
}

export const STANDARD_FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: 'offers', name: 'Special Offers', description: 'Promotions and special deals for loyalty customers' },
  { key: 'daily_offers', name: 'Daily Offers', description: 'Daily menu specials and rotating deals' },
  { key: 'membership_tiers', name: 'Membership Tiers', description: 'Customer loyalty tiers based on lifetime points' },
  { key: 'referral_program', name: 'Referral Program', description: 'Reward customers for referring friends' },
  { key: 'notifications', name: 'Customer Notifications', description: 'Automated customer notifications via WhatsApp Cloud API or SMS' },
  { key: 'points_expiry', name: 'Points Expiry', description: 'Automatic expiration of unused points after a configured duration' },
  { key: 'customer_self_signup', name: 'Self Signup', description: 'Public registration portal for new customers' },
  { key: 'analytics_reports', name: 'Analytics and Reports', description: 'Owner business analytics and insights dashboard' },
  { key: 'branch_partnerships', name: 'Branch Partnerships', description: 'Cross-business point sharing and partnerships' },
  { key: 'ai_recommendations', name: 'AI Recommendations', description: 'Smart AI-powered customer reward recommendations via Gemini' },
  // Phase 27.7: Cross-branch redemption control — allow or restrict redemption across branches
  { key: 'cross_branch_redemption', name: 'Cross-Branch Redemption', description: 'Allow customers to redeem points at any branch, not just where they were earned' },
  // Phase 30.1: SMS notifications via Twilio or Mock Provider
  { key: 'sms_notifications', name: 'SMS Notifications', description: 'Automated customer SMS notifications via Twilio or custom provider' },
  // Phase 31.1: AI Anomaly Detection via Gemini
  { key: 'ai_anomaly_detection', name: 'AI Anomaly Detection', description: 'Smart anomaly detection and AI explanation for suspicious points activity' },
  // Phase 32.6: Notify Owner on offline sync failure via SMS
  { key: 'notify_owner_sync_failure', name: 'Notify Owner on Sync Failure', description: 'Send SMS alert to business owner if an offline cashier transaction fails during synchronization' },
];

/**
 * Standard default status for features when no row exists yet in business_features.
 * PLAN.md Phase 16.1, 21.5, 22.2, 24.1, 30.1, 31.1 & 32.6:
 * 'notifications', 'sms_notifications', 'customer_self_signup', 'ai_recommendations', 'ai_anomaly_detection', and 'notify_owner_sync_failure' default to FALSE (require setup/credentials).
 * All other features default to TRUE.
 */
export function getDefaultFeatureStatus(featureKey: string): boolean {
  if (
    featureKey === 'notifications' ||
    featureKey === 'sms_notifications' ||
    featureKey === 'ai_recommendations' ||
    featureKey === 'ai_anomaly_detection' ||
    featureKey === 'notify_owner_sync_failure'
  ) {
    return false;
  }
  return true;
}

/**
 * Phase 16.1 & 22.4: Central check whether a feature is enabled for a business.
 * Uses service role client to ensure reliable, authoritative evaluation.
 */
export async function isFeatureEnabled(businessId: string, featureKey: string): Promise<boolean> {
  if (!businessId || !featureKey) return false;

  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('business_features')
      .select('is_enabled')
      .eq('business_id', businessId)
      .eq('feature_key', featureKey)
      .maybeSingle();

    if (error || !data) {
      // Return default status if row does not exist yet
      return getDefaultFeatureStatus(featureKey);
    }

    return Boolean(data.is_enabled);
  } catch (err) {
    console.error(`isFeatureEnabled error for ${businessId}/${featureKey}:`, err);
    // Safe fallback to default
    return getDefaultFeatureStatus(featureKey);
  }
}

/**
 * Phase 22.4: Guard helper that checks feature status and returns a 403 response if disabled.
 */
export async function assertFeatureEnabled(
  businessId: string,
  featureKey: string,
  errorMessage?: string
): Promise<NextResponse | null> {
  const enabled = await isFeatureEnabled(businessId, featureKey);
  if (!enabled) {
    return NextResponse.json(
      {
        success: false,
        error: errorMessage || 'هذه الميزة غير مفعّلة لهذا المكان',
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Fetch all feature definitions and their current enabled status for a business.
 */
export async function getBusinessFeaturesWithDefs(businessId: string) {
  const adminClient = getServiceSupabase();

  // 1. Get all definitions from DB or fallback
  const { data: defs } = await adminClient
    .from('feature_definitions')
    .select('key, name, description')
    .order('key');

  const featureDefs: FeatureDefinition[] = (defs && defs.length > 0) ? defs : STANDARD_FEATURE_DEFINITIONS;

  // 2. Get active overrides for this business
  const { data: bFeatures } = await adminClient
    .from('business_features')
    .select('feature_key, is_enabled')
    .eq('business_id', businessId);

  const featureMap: Record<string, boolean> = {};
  for (const def of featureDefs) {
    featureMap[def.key] = getDefaultFeatureStatus(def.key);
  }

  if (bFeatures) {
    for (const row of bFeatures) {
      featureMap[row.feature_key] = Boolean(row.is_enabled);
    }
  }

  return {
    definitions: featureDefs,
    features: featureMap,
  };
}

/**
 * Phase 22.3: Automatically populate business_features for all definitions when a business is created.
 */
export async function initializeBusinessFeatures(
  businessId: string,
  updatedBy?: string | null
): Promise<boolean> {
  const adminClient = getServiceSupabase();

  const { data: defs } = await adminClient
    .from('feature_definitions')
    .select('key');

  const keys = (defs && defs.length > 0)
    ? defs.map((d) => d.key)
    : STANDARD_FEATURE_DEFINITIONS.map((d) => d.key);

  const now = new Date().toISOString();
  const rows = keys.map((key) => ({
    business_id: businessId,
    feature_key: key,
    is_enabled: getDefaultFeatureStatus(key),
    updated_at: now,
    updated_by: updatedBy || null,
  }));

  const { error } = await adminClient
    .from('business_features')
    .upsert(rows, { onConflict: 'business_id, feature_key' });

  if (error) {
    console.error(`Failed to initialize features for business ${businessId}:`, error);
    throw error;
  }

  return true;
}

/**
 * Helper to clear tenant cache for a business whenever features are modified (Phase 22.7).
 */
async function invalidateBusinessCache(businessId: string): Promise<void> {
  try {
    const adminClient = getServiceSupabase();
    const { data: biz } = await adminClient
      .from('businesses')
      .select('subdomain')
      .eq('id', businessId)
      .maybeSingle();

    if (biz?.subdomain) {
      clearTenantCache(biz.subdomain);
    } else {
      clearTenantCache();
    }
  } catch (err) {
    console.warn(`Failed to clear tenant cache for business ${businessId}:`, err);
  }
}

/**
 * Toggle or set a specific feature for a business (Phase 22.5 & 22.7).
 */
export async function setBusinessFeature(
  businessId: string,
  featureKey: string,
  isEnabled: boolean,
  updatedBy?: string | null
): Promise<boolean> {
  const adminClient = getServiceSupabase();

  const { error } = await adminClient
    .from('business_features')
    .upsert(
      {
        business_id: businessId,
        feature_key: featureKey,
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || null,
      },
      { onConflict: 'business_id, feature_key' }
    );

  if (error) {
    console.error(`Error updating business feature ${featureKey}:`, error);
    throw error;
  }

  // Phase 22.7: Clear cache immediately
  await invalidateBusinessCache(businessId);

  return true;
}

/**
 * Phase 22.6 & 22.7: Update all features for a business in a single database operation (Bulk Update).
 * Core points system is completely unaffected as it is not part of business_features.
 */
export async function setAllBusinessFeatures(
  businessId: string,
  isEnabled: boolean,
  updatedBy?: string | null
): Promise<boolean> {
  const adminClient = getServiceSupabase();

  const { data: defs } = await adminClient
    .from('feature_definitions')
    .select('key');

  const keys = (defs && defs.length > 0)
    ? defs.map((d) => d.key)
    : STANDARD_FEATURE_DEFINITIONS.map((d) => d.key);

  const now = new Date().toISOString();
  const rows = keys.map((key) => ({
    business_id: businessId,
    feature_key: key,
    is_enabled: isEnabled,
    updated_at: now,
    updated_by: updatedBy || null,
  }));

  const { error } = await adminClient
    .from('business_features')
    .upsert(rows, { onConflict: 'business_id, feature_key' });

  if (error) {
    console.error(`Failed to bulk update features for business ${businessId}:`, error);
    throw error;
  }

  // Phase 22.7: Clear cache immediately
  await invalidateBusinessCache(businessId);

  return true;
}

/**
 * Bulk upsert an arbitrary map of features for a business in a single operation.
 */
export async function setBusinessFeaturesBulk(
  businessId: string,
  features: Record<string, boolean>,
  updatedBy?: string | null
): Promise<boolean> {
  const adminClient = getServiceSupabase();
  const now = new Date().toISOString();

  const rows = Object.entries(features).map(([key, enabled]) => ({
    business_id: businessId,
    feature_key: key,
    is_enabled: Boolean(enabled),
    updated_at: now,
    updated_by: updatedBy || null,
  }));

  if (rows.length === 0) return true;

  const { error } = await adminClient
    .from('business_features')
    .upsert(rows, { onConflict: 'business_id, feature_key' });

  if (error) {
    console.error(`Failed to bulk upsert features for business ${businessId}:`, error);
    throw error;
  }

  // Phase 22.7: Clear cache immediately
  await invalidateBusinessCache(businessId);

  return true;
}
