import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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

  // Automatically instrument Next.js server components
  autoInstrumentServerFunctions: true,

  // Tunnel Sentry requests through your own domain to avoid ad-blockers
  tunnelRoute: '/monitoring-tunnel',

  // Disable logger in production builds
  disableLogger: true,

  // Source maps: hidden from deployed bundles, uploaded to Sentry only
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
