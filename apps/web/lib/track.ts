import * as Sentry from '@sentry/nextjs';

/**
 * Landing-ийн хэмжилт. `Sentry.metrics.count` байгаа ч client bundle-д ~2 kB нэмдэг (shared budget ≤200 kB) тул
 * `addBreadcrumb` ашиглана. Sentry DSN байхгүй (init хийгээгүй) үед no-op. PII оруулахгүй — зөвхөн тогтмол шошго.
 */
export type TrackEvent = 'cta_click' | 'section_view';

export function track(event: TrackEvent, data: Record<string, string>): void {
  try {
    Sentry.addBreadcrumb({ category: 'track', message: event, data, level: 'info' });
  } catch {
    // хэмжилт хэзээ ч UI-г эвдэхгүй
  }
}
