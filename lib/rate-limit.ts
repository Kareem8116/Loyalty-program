import { NextRequest } from 'next/server';
import { redis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

// In-memory fallback store for offline development or Redis degradation
interface MemoryRateLimitRecord {
  count: number;
  resetTime: number;
}
const memoryStore = new Map<string, MemoryRateLimitRecord>();

function checkInMemoryFallback(
  identifier: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = memoryStore.get(identifier);

  if (!existing || now > existing.resetTime) {
    memoryStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetTime - now) / 1000));
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds: retryAfter,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit: maxRequests,
    remaining: maxRequests - existing.count,
    retryAfterSeconds: Math.ceil((existing.resetTime - now) / 1000),
  };
}

/**
 * Phase 8.8: Distributed Rate Limiting via Upstash Redis.
 * 
 * Works across all Vercel serverless instances and edge regions.
 * Falls back gracefully to in-memory rate limiting if Redis is temporarily unreachable.
 * 
 * @param identifier Client IP, User ID, or composite key (e.g. `cashier:123:minute`)
 * @param maxRequests Maximum requests allowed within window (default: 30)
 * @param windowMs Window duration in milliseconds (default: 60,000ms / 1 minute)
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests = 30,
  windowMs = 60 * 1000
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    // Increment the counter atomically in Redis
    const count = await redis.incr(key);

    // If it's the first hit, set the expiration window
    if (count === 1) {
      await redis.expire(key, windowSeconds);
      return {
        allowed: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        retryAfterSeconds: windowSeconds,
      };
    }

    // Query remaining TTL
    let ttl = await redis.ttl(key);
    if (ttl <= 0) {
      // Key had no TTL (edge case), set it
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }

    if (count > maxRequests) {
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSeconds: Math.max(1, ttl),
      };
    }

    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - count),
      retryAfterSeconds: Math.max(1, ttl),
    };
  } catch (err) {
    console.warn(`[rate-limit] Redis unavailable for key ${key}, falling back to in-memory:`, err);
    return checkInMemoryFallback(identifier, maxRequests, windowMs);
  }
}

/**
 * Helper to extract client IP from NextRequest.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Synchronous in-memory rate limit checker for unit tests and local mocks
 */
export function checkRateLimitSync(
  identifier: string,
  maxRequests = 30,
  windowMs = 60 * 1000
): RateLimitResult {
  return checkInMemoryFallback(identifier, maxRequests, windowMs);
}
