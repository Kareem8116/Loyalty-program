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

/**
 * Cookie Name for Role Isolation & Edge Guarding
 */
export const POINTAT_ROLE_COOKIE = 'pointat_role';

export type PortalRole = 'customer' | 'cashier' | 'owner' | 'branch_admin' | 'super_admin';

/**
 * Client-side helper to set the active portal role cookie.
 * This cookie is read by Next.js Edge Middleware to guard /admin, /cashier, and /super-admin.
 */
export function setClientRoleCookie(role: PortalRole | string, maxAgeDays = 30): void {
  if (typeof document === 'undefined') return;
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  document.cookie = `${POINTAT_ROLE_COOKIE}=${encodeURIComponent(role)}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure ? '; Secure' : ''}`;
}

/**
 * Client-side helper to get the active portal role cookie.
 */
export function getClientRoleCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${POINTAT_ROLE_COOKIE}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Client-side helper to clear the active portal role cookie upon sign-out.
 */
export function clearClientRoleCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${POINTAT_ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

