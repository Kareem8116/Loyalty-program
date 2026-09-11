import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Helper — Pointat
 * 
 * Utility functions for manual error capture with business context.
 * Always attach business_id, role, and user_id so every error in the
 * Sentry dashboard is instantly traceable to a specific tenant/role.
 *
 * Usage:
 *   import { captureBusinessError } from '@/lib/sentry';
 *   captureBusinessError(error, { businessId, role, userId });
 */

interface SentryContext {
  businessId?: string | null;
  role?: string | null;
  userId?: string | null;
  branchId?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Capture an error with full Pointat business context.
 * Use in API routes, server actions, and client components.
 */
export function captureBusinessError(
  error: unknown,
  context: SentryContext = {}
): void {
  Sentry.withScope((scope) => {
    // Tag by business and role for fast Sentry filtering
    if (context.businessId) scope.setTag('business_id', context.businessId);
    if (context.role)       scope.setTag('role', context.role);
    if (context.branchId)   scope.setTag('branch_id', context.branchId);

    // Set user context (no PII — only IDs)
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    // Attach any extra diagnostic data
    if (context.extra) {
      scope.setExtras(context.extra);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture a non-fatal message (warning/info level) with business context.
 */
export function captureBusinessMessage(
  message: string,
  level: Sentry.SeverityLevel = 'warning',
  context: SentryContext = {}
): void {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    if (context.businessId) scope.setTag('business_id', context.businessId);
    if (context.role)       scope.setTag('role', context.role);
    if (context.extra)      scope.setExtras(context.extra);
    Sentry.captureMessage(message);
  });
}

/**
 * Set the active user context (call after successful login).
 * Only stores the user ID — no email or personal data.
 */
export function setSentryUser(userId: string, role?: string): void {
  Sentry.setUser({ id: userId });
  if (role) Sentry.setTag('role', role);
}

/**
 * Clear the user context (call on logout).
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

export { Sentry };
