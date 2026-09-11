import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Server-Side Configuration (Node.js API Routes / SSR)
 * PLAN.md 0.8 — Observability: server errors captured with environment tagging.
 *
 * sendDefaultPii: false already prevents PII/Authorization headers from being
 * sent. No manual breadcrumb filtering needed.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% trace sampling in dev, 10% in production to control costs
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Prevent PII (emails, IPs, Authorization headers) from being sent
  sendDefaultPii: false,

  // Debug logging only in development
  debug: process.env.NODE_ENV === 'development',

  // Tag all events by environment for easy filtering
  environment: process.env.NODE_ENV,
});
