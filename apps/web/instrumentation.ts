import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

/** Server component / route handler-ийн алдааг Sentry-д (DSN байхгүй бол init хийгдээгүй тул no-op). */
export const onRequestError = Sentry.captureRequestError;
