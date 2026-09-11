import { createClient } from '@supabase/supabase-js';

/**
 * PLAN.md 0.4 — Connection URL Separation (MANDATORY for serverless/edge)
 *
 * Supabase exposes three different database URLs:
 *
 *   1. NEXT_PUBLIC_SUPABASE_URL    — The Supabase REST/Auth URL. Used by the JS SDK
 *                                    (both browser and server). This is the main URL
 *                                    for all createClient() calls.
 *
 *   2. DATABASE_URL               — Transaction Pooler URL (port 6543, PgBouncer).
 *                                    Use this for any raw SQL / direct Postgres queries
 *                                    from API routes or serverless functions.
 *                                    Each serverless invocation gets a *pooled* connection
 *                                    that is released immediately — safe under load.
 *
 *   3. DATABASE_DIRECT_URL        — Direct Connection URL (port 5432).
 *                                    ONLY for `supabase db push` / migrations.
 *                                    NEVER use in API routes: a direct connection holds a
 *                                    slot from the DB's 60-connection pool for the full
 *                                    request lifetime, causing exhaustion under traffic.
 *
 * The Supabase JS SDK (createClient) internally uses the REST API over HTTPS,
 * NOT a raw TCP Postgres connection, so it is always safe in serverless contexts.
 * DATABASE_URL / DATABASE_DIRECT_URL are only needed if you add a raw Postgres
 * driver (e.g. pg, postgres.js) in the future.
 */

// Auto-load .env.local if running in Node.js scripts outside Next.js runtime
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && typeof window === 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
    dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
  } catch {
    // Ignore in production Next.js environment
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const getSupabaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  return url;
};

export const getSupabaseAnonKey = () => {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseAnonKey;
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return key;
};

/**
 * Returns the Transaction Pooler connection string (port 6543).
 * Use this for any direct Postgres driver usage inside API routes.
 * Falls back to NEXT_PUBLIC_SUPABASE_URL if DATABASE_URL is not set
 * (acceptable during local dev without a raw PG driver).
 */
export const getPoolerDatabaseUrl = () => {
  return process.env.DATABASE_URL || null;
};

/**
 * Returns the Direct Connection string (port 5432).
 * ONLY for migrations (`supabase db push`). NEVER in API routes.
 */
export const getDirectDatabaseUrl = () => {
  return process.env.DATABASE_DIRECT_URL || null;
};

// Client for browser and general authenticated operations (respects RLS)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
);

// Helper for server-side admin operations using service_role key (bypasses RLS)
export const getServiceSupabase = () => {
  const url = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment.');
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

// Helper for server-side operations executed on behalf of an authenticated user (strictly respects RLS)
export const getUserSupabase = (jwtToken: string) => {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

