import * as Sentry from '@sentry/nestjs';
import { SENTRY_DATA_COLLECTION, scrubSentryEvent } from '@lms/shared';

type SentryEnv = Partial<Pick<NodeJS.ProcessEnv, 'SENTRY_DSN' | 'SENTRY_ENVIRONMENT' | 'SENTRY_RELEASE' | 'SENTRY_TRACES_SAMPLE_RATE' | 'NODE_ENV' | 'RAILWAY_GIT_COMMIT_SHA'>>;

/** SENTRY_DSN хоосон бол null — Sentry бүрэн унтарна (dev, тест). */
export function sentryOptions(env: SentryEnv): Sentry.NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'production',
    release: env.SENTRY_RELEASE || env.RAILWAY_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0.1,
    // IP, cookie, header, body-г автоматаар цуглуулахгүй; нэмж beforeSend-ээр цэвэрлэнэ.
    dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
    beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    beforeSendTransaction: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    beforeBreadcrumb: (crumb) => scrubSentryEvent({ breadcrumbs: [crumb] }).breadcrumbs[0] as typeof crumb,
  };
}

let enabled = false;

/** Process-ийн хамгийн эхэнд (бусад import-оос өмнө) нэг удаа дуудна. DSN байхгүй бол юу ч хийхгүй. */
export function initSentry(env: SentryEnv = process.env): boolean {
  const options = sentryOptions(env);
  if (!options) return false;
  Sentry.init(options);
  enabled = true;
  return true;
}

export const isSentryEnabled = (): boolean => enabled;
