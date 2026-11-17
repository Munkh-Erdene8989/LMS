import { SENTRY_DATA_COLLECTION, scrubSentryEvent } from '@lms/shared';

/**
 * Sentry тохиргоо (client, server, edge-д нийтлэг). DSN байхгүй бол `null` — дуудагч init хийхгүй, Sentry бүрэн унтарна.
 * Client bundle-д зөвхөн `NEXT_PUBLIC_*` орно; server `SENTRY_DSN`-ийг давуу уншина.
 */
export function sentryOptions() {
  const dsn = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();
  if (!dsn) return null;
  const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1');
  const scrub = <T,>(event: T): T => scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as T;
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0.1,
    dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
    beforeSend: scrub,
    beforeSendTransaction: scrub,
  };
}
