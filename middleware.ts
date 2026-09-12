import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge-compatible helper: check if a business subdomain is active.
 * Uses Supabase REST API directly (no Node.js dependencies like `next/headers`).
 * Fails open — if the check errors, we allow the request through.
 */
async function isBusinessActive(subdomain: string): Promise<boolean | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !subdomain) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/businesses?select=is_active&subdomain=eq.${encodeURIComponent(subdomain)}&limit=1`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
        },
        // Edge-friendly: no cache, always fresh
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const rows: Array<{ is_active: boolean }> = await res.json();
    if (rows.length === 0) return null; // Not found — let downstream handle 404
    return rows[0].is_active;
  } catch {
    return null; // Fail-open
  }
}

/**
 * Phase 8.1 & 8.6: Next.js Middleware — Subdomain Extraction & Cookie Scoping
 * 
 * 1. Reads the Host header from every incoming request, extracts the subdomain
 *    (the part before the primary domain), and passes it downstream via `x-subdomain`.
 * 
 * 2. Enforces Phase 8.6 Cookie Scoping:
 *    All authentication & session cookies are strictly scoped to the current host / subdomain.
 *    - domain: undefined (NEVER set to parent domain e.g. '.pointat.net')
 *    - sameSite: 'strict'
 *    - httpOnly: true
 *    - secure: true (in production)
 * 
 * This guarantees complete session isolation between tenants:
 * e.g., a cashier logged in at 'cafe.pointat.net' cannot share or leak session tokens
 * to 'admin.pointat.net' or 'othercafe.pointat.net'.
 */

// Hosts that are NOT subdomains (bare domain or aliases)
const IGNORED_SUBDOMAINS = new Set(['www', 'localhost']);

/**
 * Extract the subdomain from a full host string.
 * 
 * For `localhost` dev: "sub.localhost:3000" → "sub"
 * For production:     "sub.yourapp.com"    → "sub"
 */
export function extractSubdomain(host: string): string {
  // Strip port if present
  const hostname = host.split(':')[0].toLowerCase();
  const parts = hostname.split('.');

  // localhost special case: "sub.localhost" has 2 parts
  if (parts.length === 2 && parts[1] === 'localhost') {
    const candidate = parts[0];
    return IGNORED_SUBDOMAINS.has(candidate) ? '' : candidate;
  }

  // Vercel.app special case:
  // "project.vercel.app" (3 parts) is the main project domain, not a tenant subdomain.
  // "store.project.vercel.app" (4+ parts) has a tenant subdomain.
  if (hostname.endsWith('.vercel.app')) {
    if (parts.length > 3) {
      const candidate = parts[0];
      return IGNORED_SUBDOMAINS.has(candidate) ? '' : candidate;
    }
    return '';
  }

  // Standard custom domains: "sub.example.com" has 3+ parts
  // "example.com" has 2 parts → no subdomain
  if (parts.length >= 3) {
    const candidate = parts[0];
    return IGNORED_SUBDOMAINS.has(candidate) ? '' : candidate;
  }

  return '';
}

import { POINTAT_ROLE_COOKIE } from './lib/cookies';

// export function middleware
export async function middleware(request: NextRequest) {
  // Support both direct host and proxy/forwarded headers (Cloudflare, Vercel, local test suites)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const querySubdomain = request.nextUrl.searchParams.get('store') || request.nextUrl.searchParams.get('subdomain') || '';
  const subdomain = extractSubdomain(host) || querySubdomain.toLowerCase().trim() || request.headers.get('x-subdomain') || '';

  // Clone request headers and inject the resolved subdomain
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-subdomain', subdomain);

  const pathname = request.nextUrl.pathname;

  // ---------------------------------------------------------------------------
  // 1. Subdomain Portal Routing (POS / Admin Subdomain Aliases)
  // ---------------------------------------------------------------------------
  if (subdomain === 'pos' || subdomain === 'cashier') {
    if (pathname === '/' || pathname === '/login') {
      const posUrl = new URL('/cashier', request.url);
      return NextResponse.redirect(posUrl);
    }
  } else if (subdomain === 'admin' || subdomain === 'dashboard') {
    if (pathname === '/' || pathname === '/login') {
      const adminUrl = new URL('/admin', request.url);
      return NextResponse.redirect(adminUrl);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Edge Route Guarding — Role Isolation for Admin / Cashier / Super Admin
  // (Prevents unauthenticated or mismatched users from downloading portal bundles)
  // Skip API routes, _next internals, and static assets
  // ---------------------------------------------------------------------------
  const isApiRoute = pathname.startsWith('/api/');
  const isStatic = pathname.startsWith('/_next') || pathname.includes('.');

  if (!isApiRoute && !isStatic) {
    const roleCookie = request.cookies.get(POINTAT_ROLE_COOKIE)?.value;

    // A) Super Admin Portal Guard
    if (pathname.startsWith('/super-admin')) {
      const isSuperAdminLogin = pathname === '/super-admin/login';
      if (!isSuperAdminLogin && roleCookie !== 'super_admin') {
        const loginUrl = new URL('/super-admin/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    }

    // B) Store Admin Portal Guard
    else if (pathname.startsWith('/admin')) {
      const isAdminLogin = pathname === '/admin/login';
      const allowedAdminRoles = ['owner', 'branch_admin'];
      if (!isAdminLogin && (!roleCookie || !allowedAdminRoles.includes(roleCookie))) {
        const loginUrl = new URL('/admin/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    }

    // C) Cashier Portal Guard
    else if (pathname.startsWith('/cashier')) {
      const isCashierLogin = pathname === '/cashier/login';
      if (!isCashierLogin && roleCookie !== 'cashier') {
        const loginUrl = new URL('/cashier/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Phase 9.3: Block access to disabled businesses
  // ---------------------------------------------------------------------------
  const isSystemRoute = pathname.startsWith('/super-admin') ||
    pathname.startsWith('/api/super-admin') ||
    pathname.startsWith('/business-disabled') ||
    pathname.startsWith('/monitoring-tunnel') ||
    pathname.startsWith('/_next');

  if (subdomain && !isSystemRoute && subdomain !== 'pos' && subdomain !== 'cashier' && subdomain !== 'admin' && subdomain !== 'dashboard') {
    try {
      const active = await isBusinessActive(subdomain);
      if (active === false) {
        // Business exists but is deactivated — serve blocked page
        const disabledUrl = new URL('/business-disabled', request.url);
        return NextResponse.redirect(disabledUrl);
      }
    } catch (tenantErr) {
      // Fail-open: if tenant lookup fails, let the request through
      console.warn('[middleware] Tenant is_active check failed (fail-open):', tenantErr);
    }
  }

  // Prepare response
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Echo the subdomain in response header for downstream verification and caching
  response.headers.set('x-subdomain', subdomain);

  // ---------------------------------------------------------------------------
  // 4. Phase 8.6: Cookie Scoping
  // ---------------------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  const cookies = request.cookies.getAll();

  for (const cookie of cookies) {
    // If it's a Supabase auth token or tenant session cookie
    if (
      cookie.name.startsWith('sb-') ||
      cookie.name.includes('auth-token') ||
      cookie.name.includes('session')
    ) {
      // Enforce strict cookie scoping options
      response.cookies.set({
        name: cookie.name,
        value: cookie.value,
        domain: undefined, // Scoped strictly to current subdomain / host
        sameSite: 'strict',
        httpOnly: true,
        secure: isProd,
        path: '/',
      });
    }
  }

  return response;
}


/**
 * Matcher: run middleware on all routes EXCEPT static assets, _next internals,
 * and the favicon.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
