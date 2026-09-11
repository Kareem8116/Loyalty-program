import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

/**
 * Phase 8.6: Auth Session Isolation via Subdomains (Cookie Scoping)
 * 
 * Rules:
 * 1. domain MUST be undefined — never set to parent domain (e.g. '.pointat.net').
 *    This ensures browsers strictly isolate session cookies to the current host / subdomain.
 * 2. SameSite MUST be 'strict' to prevent cross-site request forgery and cookie leaks.
 * 3. httpOnly MUST be true to prevent XSS access to authentication tokens.
 * 4. secure MUST be true in production (HTTPS).
 */
export const SECURE_TENANT_COOKIE_OPTIONS: Partial<ResponseCookie> = {
  domain: undefined, // NEVER '.pointat.net' — scoped strictly to current subdomain
  sameSite: 'strict',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/**
 * Helper to apply secure cookie options to a ResponseCookie
 */
export function applyTenantCookieScoping(cookie: ResponseCookie): ResponseCookie {
  return {
    ...cookie,
    domain: undefined, // Prevent parent-domain sharing
    sameSite: 'strict',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}
