import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Sentry org & project (from pointat.sentry.io)
  org: 'pointat',
  project: 'javascript-nextjs',

  // Upload source maps silently (no terminal noise)
  silent: !process.env.CI,

  // Widen tree-shaking to reduce bundle size
  widenClientFileUpload: true,

  // Tunnel Sentry requests through your own domain to avoid ad-blockers
  tunnelRoute: '/monitoring-tunnel',

  // Source maps: hidden from deployed bundles, uploaded to Sentry only
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Webpack-specific options (replaces deprecated top-level flags)
  webpack: {
    // Auto-instrument Next.js server functions (replaces autoInstrumentServerFunctions)
    autoInstrumentServerFunctions: true,
    // Remove debug logging in production (replaces disableLogger)
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

