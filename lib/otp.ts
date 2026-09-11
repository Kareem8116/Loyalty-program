/**
 * lib/otp.ts
 * Phase 29 & Profile Security: OTP Generation, Redis Storage, Expiry & Rate Limiting Engine
 * 
 * Features:
 * 1. Cryptographically secure 6-digit numeric generation (crypto.randomInt).
 * 2. Stored in Upstash Redis with 10-minute TTL.
 * 3. Enforces 60-second cooldown between resend attempts (1 minute timer).
 * 4. Strict Rate Limiting: Max 5 OTP requests per 15 minutes per user/target.
 * 5. Anti-brute-force: Max 5 failed attempts per OTP before automatic invalidation.
 * 6. One-time use: Cleared from Redis immediately upon successful verification.
 */

import crypto from 'crypto';
import { redis } from '@/lib/redis';

export const OTP_EXPIRY_SECONDS = 600; // 10 minutes
export const OTP_COOLDOWN_SECONDS = 60; // 60 seconds (1 minute cooldown)
export const MAX_OTP_ATTEMPTS = 5; // Max 5 verification attempts per OTP
export const OTP_MAX_PER_15_MIN = 5; // Max 5 OTP requests per 15 minutes
export const OTP_15_MIN_WINDOW_SECONDS = 900; // 15 minutes window (900 seconds)

interface StoredOtpData {
  otp: string;
  attempts: number;
  createdAt: number;
}

/**
 * Normalizes email address to avoid case-sensitivity bugs
 */
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Normalizes phone number by removing non-digits
 */
export function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '').trim();
}

/**
 * Returns the Redis key for a given email or phone OTP payload
 */
function getOtpKey(target: string, type: 'email' | 'phone' = 'email'): string {
  return `${type}_otp:${target}`;
}

/**
 * Returns the Redis key for password change OTP
 */
function getPasswordOtpKey(target: string, type: 'email' | 'phone'): string {
  return `pwd_change_otp:${type}:${target}`;
}

/**
 * Returns the Redis key for the 60-second resend cooldown
 */
function getCooldownKey(target: string, type: 'email' | 'phone' = 'email', prefix = 'otp'): string {
  return `${prefix}_cooldown:${type}:${target}`;
}

/**
 * Returns the Redis key for the 15-minute rate limit counter
 */
function getRateLimit15MinKey(target: string, type: 'email' | 'phone'): string {
  return `otp_15m_count:${type}:${target}`;
}

/**
 * Checks remaining cooldown seconds for sending OTP to an email
 */
export async function getOtpCooldownRemaining(email: string): Promise<number> {
  const cleanEmail = normalizeEmail(email);
  try {
    const ttl = await redis.ttl(getCooldownKey(cleanEmail, 'email'));
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    console.warn('[OTP] Error reading cooldown TTL from Redis:', err);
    return 0;
  }
}

/**
 * Checks remaining cooldown seconds for sending OTP to a phone number
 */
export async function getPhoneOtpCooldownRemaining(phone: string): Promise<number> {
  const cleanPhone = normalizePhone(phone);
  try {
    const ttl = await redis.ttl(getCooldownKey(cleanPhone, 'phone'));
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    console.warn('[OTP] Error reading phone cooldown TTL from Redis:', err);
    return 0;
  }
}

/**
 * Checks whether the target has exceeded the 5 OTPs per 15-minutes quota.
 */
export async function check15MinOtpRateLimit(
  target: string,
  type: 'email' | 'phone'
): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}> {
  const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);
  if (!cleanTarget) return { allowed: true, remainingAttempts: OTP_MAX_PER_15_MIN };

  const key = getRateLimit15MinKey(cleanTarget, type);
  try {
    const countVal = await redis.get<number | string>(key);
    const count = countVal ? parseInt(String(countVal), 10) : 0;

    if (count >= OTP_MAX_PER_15_MIN) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: ttl > 0 ? ttl : OTP_15_MIN_WINDOW_SECONDS,
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.max(0, OTP_MAX_PER_15_MIN - count),
    };
  } catch (err) {
    console.warn('[OTP] Error checking 15m rate limit:', err);
    return { allowed: true, remainingAttempts: OTP_MAX_PER_15_MIN };
  }
}

/**
 * Increments the 15-minute OTP request counter for a target.
 */
export async function increment15MinOtpCount(
  target: string,
  type: 'email' | 'phone'
): Promise<void> {
  const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);
  if (!cleanTarget) return;

  const key = getRateLimit15MinKey(cleanTarget, type);
  try {
    const exists = await redis.exists(key);
    if (!exists) {
      await redis.setex(key, OTP_15_MIN_WINDOW_SECONDS, '1');
    } else {
      await redis.incr(key);
    }
  } catch (err) {
    console.warn('[OTP] Error incrementing 15m count:', err);
  }
}

/**
 * Generates a new 6-digit OTP for any credential (email or phone),
 * enforcing 15-minute max limit (5 OTPs) and 60-second cooldown.
 */
export async function generateCredentialOtp(
  target: string,
  type: 'email' | 'phone',
  ignoreCooldown = false
): Promise<{
  success: boolean;
  otp?: string;
  cooldownRemaining?: number;
  error?: string;
  message?: string;
}> {
  const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);

  if (!cleanTarget) {
    return { success: false, error: 'INVALID_TARGET' };
  }

  // 1. Check 15-minute rate limit (5 OTP per 15 minutes)
  const rateLimit = await check15MinOtpRateLimit(cleanTarget, type);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'MAX_OTP_PER_15_MIN_EXCEEDED',
      cooldownRemaining: rateLimit.retryAfterSeconds,
      message: 'تجاوزت الحد الأقصى لإرسال رمز التحقق (5 محاولات خلال 15 دقيقة). يرجى الانتظار والمحاولة لاحقاً.',
    };
  }

  // 2. Check 60-second cooldown unless bypassed
  if (!ignoreCooldown) {
    try {
      const ttl = await redis.ttl(getCooldownKey(cleanTarget, type));
      if (ttl > 0) {
        return {
          success: false,
          cooldownRemaining: ttl,
          error: 'COOLDOWN_ACTIVE',
        };
      }
    } catch (err) {
      console.warn('[OTP] Error checking cooldown:', err);
    }
  }

  // 3. Generate secure 6-digit OTP (100000 - 999999)
  const otpNumber = crypto.randomInt(100000, 1000000);
  const otp = otpNumber.toString();

  const payload: StoredOtpData = {
    otp,
    attempts: 0,
    createdAt: Date.now(),
  };

  try {
    // Store in Redis with 10-minute expiry
    await redis.setex(getOtpKey(cleanTarget, type), OTP_EXPIRY_SECONDS, JSON.stringify(payload));

    // Set 60-second resend cooldown
    await redis.setex(getCooldownKey(cleanTarget, type), OTP_COOLDOWN_SECONDS, '1');

    // Increment 15-minute counter
    await increment15MinOtpCount(cleanTarget, type);

    return {
      success: true,
      otp,
    };
  } catch (err: any) {
    console.error(`[OTP] Error saving ${type} OTP to Redis:`, err);
    return {
      success: false,
      error: err.message || 'REDIS_ERROR',
    };
  }
}

/**
 * Generates a new 6-digit OTP for an email
 */
export async function generateEmailOtp(
  email: string,
  ignoreCooldown = false
): Promise<{
  success: boolean;
  otp?: string;
  cooldownRemaining?: number;
  error?: string;
  message?: string;
}> {
  return generateCredentialOtp(email, 'email', ignoreCooldown);
}

/**
 * Generates a new 6-digit OTP for a phone number
 */
export async function generatePhoneOtp(
  phone: string,
  ignoreCooldown = false
): Promise<{
  success: boolean;
  otp?: string;
  cooldownRemaining?: number;
  error?: string;
  message?: string;
}> {
  return generateCredentialOtp(phone, 'phone', ignoreCooldown);
}

export type VerifyOtpResult = {
  valid: boolean;
  error?: 'EXPIRED_OR_NOT_FOUND' | 'INVALID_OTP' | 'MAX_ATTEMPTS_EXCEEDED' | 'INTERNAL_ERROR';
  attemptsLeft?: number;
};

/**
 * Verifies a 6-digit OTP for any credential (email or phone) against Redis.
 */
export async function verifyCredentialOtp(
  target: string,
  type: 'email' | 'phone',
  inputOtp: string
): Promise<VerifyOtpResult> {
  const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);
  const cleanInput = (inputOtp || '').trim();

  try {
    const key = getOtpKey(cleanTarget, type);
    const cooldownKey = getCooldownKey(cleanTarget, type);
    const rawData = await redis.get<StoredOtpData | string>(key);

    if (!rawData) {
      return {
        valid: false,
        error: 'EXPIRED_OR_NOT_FOUND',
      };
    }

    const data: StoredOtpData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

    // Check if attempts already exceeded
    if (data.attempts >= MAX_OTP_ATTEMPTS) {
      await redis.del(key);
      return {
        valid: false,
        error: 'MAX_ATTEMPTS_EXCEEDED',
        attemptsLeft: 0,
      };
    }

    // Check code match
    if (data.otp !== cleanInput) {
      const newAttempts = data.attempts + 1;
      const attemptsLeft = MAX_OTP_ATTEMPTS - newAttempts;

      if (attemptsLeft <= 0) {
        // Exceeded: delete OTP
        await redis.del(key);
        return {
          valid: false,
          error: 'MAX_ATTEMPTS_EXCEEDED',
          attemptsLeft: 0,
        };
      }

      // Update remaining attempts and preserve remaining TTL
      const currentTtl = await redis.ttl(key);
      const ttlToUse = currentTtl > 0 ? currentTtl : OTP_EXPIRY_SECONDS;

      const updatedPayload: StoredOtpData = {
        ...data,
        attempts: newAttempts,
      };

      await redis.setex(key, ttlToUse, JSON.stringify(updatedPayload));

      return {
        valid: false,
        error: 'INVALID_OTP',
        attemptsLeft,
      };
    }

    // Match! One-time use: delete immediately
    await redis.del(key);
    await redis.del(cooldownKey);

    return {
      valid: true,
    };
  } catch (err) {
    console.error(`[OTP] Error verifying ${type} OTP in Redis:`, err);
    return {
      valid: false,
      error: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Verifies a 6-digit OTP for email
 */
export async function verifyEmailOtp(
  email: string,
  inputOtp: string
): Promise<VerifyOtpResult> {
  return verifyCredentialOtp(email, 'email', inputOtp);
}

/**
 * Verifies a 6-digit OTP for phone
 */
export async function verifyPhoneOtp(
  phone: string,
  inputOtp: string
): Promise<VerifyOtpResult> {
  return verifyCredentialOtp(phone, 'phone', inputOtp);
}

// ─────────────────────────────────────────────────────────────
// PASSWORD CHANGE OTP HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Generates OTP specifically for password change/reset,
 * enforcing 15-minute quota (5 OTPs) and 60-second cooldown.
 */
export async function generatePasswordChangeOtp(
  target: string,
  type: 'email' | 'phone',
  ignoreCooldown = false
): Promise<{
  success: boolean;
  otp?: string;
  cooldownRemaining?: number;
  error?: string;
  message?: string;
}> {
  const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);

  if (!cleanTarget) {
    return { success: false, error: 'INVALID_TARGET' };
  }

  // 1. Check 15-minute rate limit (5 requests per 15 min)
  const rateLimit = await check15MinOtpRateLimit(cleanTarget, type);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'MAX_OTP_PER_15_MIN_EXCEEDED',
      cooldownRemaining: rateLimit.retryAfterSeconds,
      message: 'تجاوزت الحد الأقصى لإرسال رمز التحقق (5 محاولات خلال 15 دقيقة). يرجى الانتظار والمحاولة لاحقاً.',
    };
  }

  // 2. Check 60-second cooldown
  if (!ignoreCooldown) {
    try {
      const ttl = await redis.ttl(getCooldownKey(cleanTarget, type, 'pwd_otp'));
      if (ttl > 0) {
        return {
          success: false,
          cooldownRemaining: ttl,
          error: 'COOLDOWN_ACTIVE',
        };
      }
    } catch (err) {
      console.warn('[OTP] Error checking password OTP cooldown:', err);
    }
  }

  // 3. Generate 6-digit OTP
  const otpNumber = crypto.randomInt(100000, 1000000);
  const otp = otpNumber.toString();

  const payload: StoredOtpData = {
    otp,
    attempts: 0,
    createdAt: Date.now(),
  };

  try {
    const key = getPasswordOtpKey(cleanTarget, type);
    const cooldownKey = getCooldownKey(cleanTarget, type, 'pwd_otp');

    await redis.setex(key, OTP_EXPIRY_SECONDS, JSON.stringify(payload));
    await redis.setex(cooldownKey, OTP_COOLDOWN_SECONDS, '1');
    await increment15MinOtpCount(cleanTarget, type);

    return {
      success: true,
      otp,
    };
  } catch (err: any) {
    console.error(`[OTP] Error saving password change OTP to Redis:`, err);
    return {
      success: false,
      error: err.message || 'REDIS_ERROR',
    };
  }
}

/**
 * Verifies the password change OTP from Redis.
 */
export async function verifyPasswordChangeOtp(
  target: string,
  type: 'email' | 'phone',
  inputOtp: string
): Promise<VerifyOtpResult> {
  const cleanTarget = type === 'email' ? normalizeEmail(target) : normalizePhone(target);
  const cleanInput = (inputOtp || '').trim();

  try {
    const key = getPasswordOtpKey(cleanTarget, type);
    const cooldownKey = getCooldownKey(cleanTarget, type, 'pwd_otp');
    const rawData = await redis.get<StoredOtpData | string>(key);

    if (!rawData) {
      return {
        valid: false,
        error: 'EXPIRED_OR_NOT_FOUND',
      };
    }

    const data: StoredOtpData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

    if (data.attempts >= MAX_OTP_ATTEMPTS) {
      await redis.del(key);
      return {
        valid: false,
        error: 'MAX_ATTEMPTS_EXCEEDED',
        attemptsLeft: 0,
      };
    }

    if (data.otp !== cleanInput) {
      const newAttempts = data.attempts + 1;
      const attemptsLeft = MAX_OTP_ATTEMPTS - newAttempts;

      if (attemptsLeft <= 0) {
        await redis.del(key);
        return {
          valid: false,
          error: 'MAX_ATTEMPTS_EXCEEDED',
          attemptsLeft: 0,
        };
      }

      const currentTtl = await redis.ttl(key);
      const ttlToUse = currentTtl > 0 ? currentTtl : OTP_EXPIRY_SECONDS;

      await redis.setex(key, ttlToUse, JSON.stringify({ ...data, attempts: newAttempts }));

      return {
        valid: false,
        error: 'INVALID_OTP',
        attemptsLeft,
      };
    }

    // Success! Clear OTP
    await redis.del(key);
    await redis.del(cooldownKey);

    return { valid: true };
  } catch (err) {
    console.error(`[OTP] Error verifying password OTP in Redis:`, err);
    return { valid: false, error: 'INTERNAL_ERROR' };
  }
}
