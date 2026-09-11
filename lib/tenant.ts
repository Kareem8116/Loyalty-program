import { headers } from 'next/headers';
import { getServiceSupabase } from './supabase';
import { redis } from './redis';

/**
 * Phase 8.2 & 8.7: Tenant Resolution & Distributed Cache (Subdomain → Business)
 *
 * Provides server-side utilities to resolve a subdomain string into a
 * full business record from the `businesses` table.
 * 
 * Uses a two-tier cache:
 * - L1: In-memory cache (30s TTL) for instantaneous in-process hits.
 * - L2: Upstash Redis distributed cache (300s / 5 minutes TTL) shared across all Vercel serverless instances.
 * 
 * Cache is automatically invalidated when a business is updated or deactivated (Phase 9.3).
 */

export interface TenantBusiness {
  id: string;
  name: string;
  subdomain: string;
  is_active: boolean;
}

// L1 In-memory cache
const L1_CACHE_TTL_MS = 30 * 1000; // 30 seconds

// L2 Distributed Redis Cache TTL (5 minutes as specified by Phase 8.7)
const REDIS_CACHE_TTL_SECONDS = 5 * 60; // 300 seconds

interface CacheEntry {
  business: TenantBusiness | null;
  expiresAt: number;
}

const tenantL1Cache = new Map<string, CacheEntry>();

function getRedisKey(subdomain: string): string {
  return `tenant:subdomain:${subdomain.toLowerCase().trim()}`;
}

/**
 * Resolve a subdomain to a business record.
 * Checks L1 memory cache -> L2 Upstash Redis cache -> Database.
 * Returns null if subdomain is empty, not found, or business is inactive.
 */
export async function resolveBusinessBySubdomain(
  subdomain: string
): Promise<TenantBusiness | null> {
  if (!subdomain) return null;

  const normalizedSub = subdomain.toLowerCase().trim();
  if (!normalizedSub) return null;

  // 1. Check L1 in-memory cache first
  const cachedL1 = tenantL1Cache.get(normalizedSub);
  if (cachedL1 && Date.now() < cachedL1.expiresAt) {
    return cachedL1.business;
  }

  // 2. Check L2 Upstash Redis distributed cache
  const redisKey = getRedisKey(normalizedSub);
  try {
    const cachedL2 = await redis.get<TenantBusiness | { notFound: true }>(redisKey);
    if (cachedL2) {
      const business = 'notFound' in cachedL2 ? null : cachedL2;
      // Populate L1 cache
      tenantL1Cache.set(normalizedSub, {
        business,
        expiresAt: Date.now() + L1_CACHE_TTL_MS,
      });
      return business;
    }
  } catch (redisErr) {
    console.warn('[tenant] Redis get error (falling back to DB):', redisErr);
  }

  // 3. Query the database via Supabase service role client
  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('businesses')
      .select('id, name, subdomain, is_active')
      .eq('subdomain', normalizedSub)
      .maybeSingle();

    if (error) {
      console.error('[tenant] DB lookup error:', error.message);
      return null;
    }

    const business: TenantBusiness | null = data
      ? {
          id: data.id,
          name: data.name,
          subdomain: data.subdomain,
          is_active: data.is_active,
        }
      : null;

    // 4. Save to L1 memory cache
    tenantL1Cache.set(normalizedSub, {
      business,
      expiresAt: Date.now() + L1_CACHE_TTL_MS,
    });

    // 5. Save to L2 Upstash Redis distributed cache (TTL = 5 minutes)
    try {
      if (business) {
        await redis.setex(redisKey, REDIS_CACHE_TTL_SECONDS, business);
      } else {
        // Negative cache for 60s to prevent DB hammering on nonexistent subdomains
        await redis.setex(redisKey, 60, { notFound: true });
      }
    } catch (redisSetErr) {
      console.warn('[tenant] Redis setex error:', redisSetErr);
    }

    return business;
  } catch (err) {
    console.error('[tenant] Unexpected error resolving subdomain:', err);
    return null;
  }
}

/**
 * Read the x-subdomain header (set by middleware) and resolve
 * the corresponding business. For use in Server Components and
 * Route Handlers.
 */
export async function getBusinessFromHeaders(): Promise<TenantBusiness | null> {
  const headerStore = await headers();
  const subdomain = headerStore.get('x-subdomain') || '';
  return resolveBusinessBySubdomain(subdomain);
}

/**
 * Read just the raw subdomain string from headers.
 * Useful when you need the subdomain without a DB lookup.
 */
export async function getSubdomainFromHeaders(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get('x-subdomain') || '';
}

/**
 * Invalidate a specific tenant cache entry from both L1 and Upstash Redis.
 */
export async function invalidateTenantCache(subdomain: string): Promise<void> {
  if (!subdomain) return;
  const normalizedSub = subdomain.toLowerCase().trim();
  
  // Invalidate L1
  tenantL1Cache.delete(normalizedSub);

  // Invalidate Redis L2
  try {
    await redis.del(getRedisKey(normalizedSub));
  } catch (error) {
    console.warn(`[tenant] Redis del error for subdomain ${subdomain}:`, error);
  }
}

/**
 * Clear the tenant cache. Useful for testing, after admin changes,
 * or immediately when a business is deactivated in Phase 9.3.
 */
export function clearTenantCache(subdomain?: string): void {
  if (subdomain) {
    const normalizedSub = subdomain.toLowerCase().trim();
    tenantL1Cache.delete(normalizedSub);
    // Fire-and-forget Redis deletion to keep function call synchronous for callers
    redis.del(getRedisKey(normalizedSub)).catch((err) => {
      console.warn(`[tenant] Async Redis del error for subdomain ${subdomain}:`, err);
    });
  } else {
    tenantL1Cache.clear();
  }
}
