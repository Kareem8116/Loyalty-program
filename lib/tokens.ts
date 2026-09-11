/**
 * Pure client/server utility to extract clean customer tokens.
 * Handles 9-character alphanumeric codes, formatted codes with hyphens, full card URLs, and UUIDs.
 */
export function extractCustomerToken(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  // 1. URL pattern: /card/[token]
  const cardUrlMatch = trimmed.match(/\/card\/([a-zA-Z0-9-]+)/i);
  if (cardUrlMatch && cardUrlMatch[1]) {
    const rawToken = cardUrlMatch[1];
    if (rawToken.match(/^[0-9a-fA-F-]{36}$/)) {
      return rawToken.toLowerCase();
    }
    const cleanAlpha = rawToken.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleanAlpha.length === 9) {
      return cleanAlpha;
    }
    return rawToken;
  }

  // 2. 36-char UUID pattern
  const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) {
    return uuidMatch[0].toLowerCase();
  }

  // 3. 9-character alphanumeric code (with or without hyphens)
  const cleanAlpha = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleanAlpha.length === 9) {
    return cleanAlpha;
  }

  return trimmed;
}