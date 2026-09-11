/**
 * Phase 0.8: Observability & Contextual Logger
 * 
 * Records structured logs and unexpected errors with full multi-tenant context:
 * - business_id
 * - user role
 * - request path
 * - timestamp & severity
 * Plugs seamlessly into Sentry if SENTRY_DSN is configured, otherwise formats structured console/observability logs.
 */

export interface LogContext {
  businessId?: string | null;
  role?: string | null;
  userId?: string | null;
  path?: string | null;
  [key: string]: any;
}

class ObservabilityLogger {
  private sentryInitialized = false;

  constructor() {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
      this.sentryInitialized = true;
    }
  }

  /**
   * Log an unexpected application error with tenant context
   */
  public captureError(error: unknown, context?: LogContext) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: errorObj.message,
      stack: errorObj.stack,
      businessId: context?.businessId || null,
      role: context?.role || null,
      userId: context?.userId || null,
      path: context?.path || null,
      extra: context,
    };

    console.error('[OBSERVABILITY_ERROR]', JSON.stringify(payload));

    // If Sentry is installed / configured in production, forward error
    if (this.sentryInitialized && typeof window === 'undefined') {
      try {
        const globalAny = global as any;
        if (globalAny?.Sentry?.captureException) {
          globalAny.Sentry.captureException(errorObj, { extra: payload });
        }
      } catch (sentryErr) {
        console.warn('Sentry forward failed (non-blocking):', sentryErr);
      }
    }
  }

  /**
   * Log an operational security or business event
   */
  public logEvent(eventName: string, context?: LogContext) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'info',
      event: eventName,
      businessId: context?.businessId || null,
      role: context?.role || null,
      userId: context?.userId || null,
      path: context?.path || null,
      ...context,
    };

    console.log('[OBSERVABILITY_EVENT]', JSON.stringify(payload));
  }

  /**
   * Log a security warning (e.g. rate limit, access denial)
   */
  public logSecurityAlert(message: string, context?: LogContext) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      alert: message,
      businessId: context?.businessId || null,
      role: context?.role || null,
      userId: context?.userId || null,
      path: context?.path || null,
      ...context,
    };

    console.warn('[OBSERVABILITY_SECURITY_ALERT]', JSON.stringify(payload));
  }
}

export const logger = new ObservabilityLogger();
