import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Client-Side Configuration (Browser)
 * PLAN.md 0.8 — Observability: automatic error tracking with business context
 *
 * DSN is stored in SENTRY_DSN env var — never hardcoded.
 * EU region: ingest.de.sentry.io
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of transactions in development, 10% in production
  // Increase tracesSampleRate for better performance insights (up to 1.0)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay: 10% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Reduce noise from browser extensions and localhost
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^moz-extension:\/\//i,
  ],

  // Ignore common non-actionable errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    /^Network request failed$/,
    /^Load failed$/,
  ],

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
    Sentry.browserTracingIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: 'dark',
    }),
  ],

  // Debug only in development
  debug: process.env.NODE_ENV === 'development',

  // Environment tagging
  environment: process.env.NODE_ENV,
});
