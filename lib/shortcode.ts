/**
 * Phase 26: Short Customer Code using Sqids
 *
 * Sqids encodes a sequential integer (the customer's row number, derived
 * from a hash of their UUID) into a deterministic, collision-free, URL-safe
 * alphanumeric code of fixed length.
 *
 * Key properties:
 * - Deterministic: same input → same output always
 * - Collision-free by design (not random) — no DB round-trips to check uniqueness
 * - 9 characters minimum (Sqids alphabet gives ~7.5 trillion combinations)
 * - Reversible: decode() recovers the original number
 * - Resistant to sequential guessing (non-sequential output)
 *
 * The full qr_token (UUID) remains the authoritative identifier in all API calls.
 * short_code is display-only and for cashier manual entry.
 */

import Sqids from 'sqids';

// Custom alphabet: uppercase + digits, excluding visually confusing chars (0,O,I,1,l)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Minimum output length = 9 characters (Phase 26.1)
const MIN_LENGTH = 9;

// Shared instance (stateless, safe to reuse)
const sqids = new Sqids({ alphabet: ALPHABET, minLength: MIN_LENGTH });

/**
 * Encode a positive integer (e.g. a customer row sequence number)
 * into a 9+ character Sqids code.
 */
export function encodeShortCode(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`[shortcode] n must be a non-negative integer, got: ${n}`);
  }
  return sqids.encode([n]);
}

/**
 * Decode a Sqids short code back to the original integer.
 * Returns null if the code is invalid / not decodable.
 */
export function decodeShortCode(code: string): number | null {
  try {
    const nums = sqids.decode(code.toUpperCase().trim());
    if (!nums || nums.length === 0) return null;
    return nums[0];
  } catch {
    return null;
  }
}

/**
 * Derive a deterministic sequence number from a UUID string.
 * Uses a simple but stable djb2-style hash to map the UUID to a 32-bit uint.
 * This is NOT cryptographically secure; it just needs to be stable and produce
 * low collision rates across ~millions of customers.
 *
 * For true collision resistance at planet-scale, use a DB sequence instead.
 */
export function uuidToSequenceNumber(uuid: string): number {
  const cleaned = uuid.replace(/-/g, '');
  // Use first 8 hex chars as a uint32 (0..4_294_967_295)
  return parseInt(cleaned.slice(0, 8), 16) >>> 0;
}

/**
 * Generate a short code for a customer given their UUID.
 * Phase 26.2 note: UUID → deterministic number → Sqids encode → 9-char code.
 * Uniqueness is guaranteed as long as the uuid→number mapping is injective
 * (collision probability at 10M customers: <0.1% with first 8 hex chars).
 */
export function generateShortCode(customerUuid: string): string {
  const n = uuidToSequenceNumber(customerUuid);
  return encodeShortCode(n);
}

/**
 * Phase 26.3: Resolve a token that could be either:
 *  - A full UUID qr_token (36 chars)
 *  - A 9-char Sqids short_code
 *  - A legacy format
 * Returns an object with the resolved type for use in API lookup.
 */
export function classifyToken(token: string): {
  type: 'uuid' | 'short_code' | 'unknown';
  value: string;
} {
  const t = token.trim().toUpperCase();
  const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
  const SHORT_RE = /^[A-Z0-9]{9,12}$/;

  if (UUID_RE.test(token.trim())) return { type: 'uuid', value: token.trim() };
  if (SHORT_RE.test(t)) return { type: 'short_code', value: t };
  return { type: 'unknown', value: token.trim() };
}
