import { Redis } from '@upstash/redis';
import * as dotenv from 'dotenv';

// Automatically load .env.local if running outside Next.js (e.g. scripts)
if (!process.env.UPSTASH_REDIS_REST_URL) {
  try {
    dotenv.config({ path: '.env.local' });
    dotenv.config({ path: '.env' });
  } catch {}
}

let _redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!_redisInstance) {
    if (!process.env.UPSTASH_REDIS_REST_URL) {
      try {
        dotenv.config({ path: '.env.local' });
      } catch {}
    }
    _redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
  }
  return _redisInstance;
}

// Transparent Proxy that lazily initializes Redis with current env
export const redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const client = getRedis();
    const val = Reflect.get(client, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});

/**
 * Helper to get a cached value or fetch it and cache it if not found.
 * @param key The Redis key
 * @param fetcher The function to fetch data if cache miss
 * @param ttl Time to live in seconds (default 3600 = 1 hour)
 */
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  try {
    const cached = await redis.get<T>(key);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn(`Redis get error for key ${key}:`, error);
    // On Redis error, just fallback to fetching
  }

  const data = await fetcher();

  try {
    if (data) {
      await redis.setex(key, ttl, data);
    }
  } catch (error) {
    console.warn(`Redis set error for key ${key}:`, error);
  }

  return data;
}

/**
 * Invalidate a cache key
 */
export async function invalidateCache(key: string) {
  try {
    await redis.del(key);
  } catch (error) {
    console.warn(`Redis del error for key ${key}:`, error);
  }
}
