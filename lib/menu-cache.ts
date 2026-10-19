/**
 * Phase 11.2 — Redis Cache for Menu Items & Redemption Rates
 *
 * Expands Upstash Redis caching (already active for subdomain resolution from Phase 8)
 * to cover high-frequency read endpoints: menu items and redemption rates.
 *
 * Cache Strategy:
 *   - Menu items: 5-minute TTL (frequently read by cashier scan screen)
 *   - Redemption rates: 10-minute TTL (rarely changes, but critical for calculations)
 *   - Invalidated automatically on any create/update/delete via the mutation helpers below.
 */

import { getServiceSupabase } from './supabase';
import { getCachedOrFetch, invalidateCache, redis } from './redis';

// ─── TTLs ────────────────────────────────────────────────────────────────────
const MENU_TTL_SECONDS = 5 * 60;        // 5 minutes
const RATES_TTL_SECONDS = 10 * 60;      // 10 minutes
const BRANDING_TTL_SECONDS = 15 * 60;  // 15 minutes (changes very rarely)

// ─── Cache Key Helpers ────────────────────────────────────────────────────────
function menuKey(businessId: string, branchId?: string | null) {
  return `menu:${businessId}:${branchId || 'all'}`;
}
function ratesKey(businessId: string) {
  return `redemption_rates:${businessId}`;
}
function brandingKey(businessId: string) {
  return `branding:${businessId}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MenuItem {
  id: string;
  business_id: string;
  branch_id: string | null;
  name: string;
  price: number;
  points_price: number | null;
  created_at: string;
}

export interface RedemptionRate {
  id: string;
  business_id: string;
  points_per_currency_unit: number;
  currency_per_point: number;
  redemption_type: 'product' | 'cash' | 'both';
  high_value_redemption_threshold: number | null;
  points_expiry_months: number | null;
  updated_at: string;
}

export interface BusinessBranding {
  id: string;
  business_id: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  layout_variant: string | null;
}

// ─── 11.2: Cached Menu Items ──────────────────────────────────────────────────

/**
 * Get menu items for a business (optionally filtered by branch).
 * Cache miss → DB query, result cached for MENU_TTL_SECONDS.
 */
export async function getCachedMenuItems(
  businessId: string,
  branchId?: string | null
): Promise<MenuItem[]> {
  const key = menuKey(businessId, branchId);

  return getCachedOrFetch<MenuItem[]>(
    key,
    async () => {
      const adminClient = getServiceSupabase();
      let query = adminClient
        .from('menu_items')
        .select('*')
        .eq('business_id', businessId)
        .order('name', { ascending: true });

      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[menu-cache] Failed to fetch menu items:', error.message);
        return [];
      }
      return (data as MenuItem[]) || [];
    },
    MENU_TTL_SECONDS
  );
}

/**
 * Invalidate menu cache for a business (all branches).
 * Call after any create/update/delete on menu_items.
 */
export async function invalidateMenuCache(
  businessId: string,
  branchId?: string | null
): Promise<void> {
  // Always invalidate the "all" cache
  await invalidateCache(menuKey(businessId, null));
  if (branchId) {
    await invalidateCache(menuKey(businessId, branchId));
  }
}

// ─── 11.2: Cached Redemption Rates ───────────────────────────────────────────

/**
 * Get redemption rates for a business.
 * Cache miss → DB query, result cached for RATES_TTL_SECONDS.
 */
export async function getCachedRedemptionRates(
  businessId: string
): Promise<RedemptionRate | null> {
  const key = ratesKey(businessId);

  return getCachedOrFetch<RedemptionRate | null>(
    key,
    async () => {
      const adminClient = getServiceSupabase();
      const { data, error } = await adminClient
        .from('redemption_rates')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle();

      if (error) {
        console.error('[menu-cache] Failed to fetch redemption rates:', error.message);
        return null;
      }
      return (data as RedemptionRate) || null;
    },
    RATES_TTL_SECONDS
  );
}

/**
 * Invalidate redemption rates cache for a business.
 * Call after updating redemption_rates table.
 */
export async function invalidateRedemptionRatesCache(businessId: string): Promise<void> {
  await invalidateCache(ratesKey(businessId));
}

// ─── 11.2: Cached Business Branding ──────────────────────────────────────────

/**
 * Get business branding configuration.
 * Cache miss → DB query, result cached for BRANDING_TTL_SECONDS.
 */
export async function getCachedBranding(
  businessId: string
): Promise<BusinessBranding | null> {
  const key = brandingKey(businessId);

  return getCachedOrFetch<BusinessBranding | null>(
    key,
    async () => {
      const adminClient = getServiceSupabase();
      const { data, error } = await adminClient
        .from('business_branding')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle();

      if (error) {
        console.error('[menu-cache] Failed to fetch business branding:', error.message);
        return null;
      }
      return (data as BusinessBranding) || null;
    },
    BRANDING_TTL_SECONDS
  );
}

/**
 * Invalidate branding cache for a business.
 */
export async function invalidateBrandingCache(businessId: string): Promise<void> {
  await invalidateCache(brandingKey(businessId));
}

// ─── Cache Warming ────────────────────────────────────────────────────────────

/**
 * Pre-warm all critical caches for a business.
 * Useful after a business is first created or after cache flush.
 */
export async function warmBusinessCache(businessId: string): Promise<void> {
  try {
    await Promise.all([
      getCachedMenuItems(businessId),
      getCachedRedemptionRates(businessId),
      getCachedBranding(businessId),
    ]);
    console.log(`[menu-cache] Cache warmed for business ${businessId}`);
  } catch (err) {
    console.warn(`[menu-cache] Cache warm failed for ${businessId}:`, err);
  }
}

// ─── Cache Stats (for monitoring) ────────────────────────────────────────────

/**
 * Get Redis memory usage info (for admin monitoring).
 * Returns null if Redis is unavailable.
 */
export async function getRedisCacheInfo(): Promise<{
  menuKeys: number;
  ratesKeys: number;
  totalCachedBusinesses: number;
} | null> {
  try {
    // Scan for known key patterns
    const menuPattern = 'menu:*';
    const ratesPattern = 'redemption_rates:*';

    // Use SCAN to count keys (non-blocking, production-safe)
    let menuCount = 0;
    let ratesCount = 0;
    let cursor = 0;

    do {
      const [nextCursor, keys]: [string, string[]] = await redis.scan(cursor, {
        match: menuPattern,
        count: 100,
      });
      cursor = parseInt(nextCursor, 10);
      menuCount += keys.length;
    } while (cursor !== 0);

    cursor = 0;
    do {
      const [nextCursor, keys]: [string, string[]] = await redis.scan(cursor, {
        match: ratesPattern,
        count: 100,
      });
      cursor = parseInt(nextCursor, 10);
      ratesCount += keys.length;
    } while (cursor !== 0);

    return {
      menuKeys: menuCount,
      ratesKeys: ratesCount,
      totalCachedBusinesses: Math.max(menuCount, ratesCount),
    };
  } catch (err) {
    console.warn('[menu-cache] Failed to get Redis cache info:', err);
    return null;
  }
}
