/**
 * Content-Security-Policy (ticket 23, 27). Нийтлэг:
 * - Mux player: HLS `stream.mux.com` (MSE → blob:), poster `image.mux.com`, Mux Data `*.litix.io`; Mux direct upload (browser PUT) GCS руу.
 * - QPay: QR нь `data:` зураг, банкны лого `qpay.mn`; deeplink нь навигаци (CSP-д хамаарахгүй).
 * - Supabase Storage: signed upload (`connect-src`), зураг/PDF (`img-src`, `frame-src`).
 * - Sentry: `*.sentry.io` (зөвхөн DSN тохируулсан үед ашиглагдана).
 * Script: хүсэлт бүрийн nonce + `'strict-dynamic'` (middleware.ts). Next.js nonce-ийг өөрийн inline/ачаалах script-үүдэд автоматаар тавина.
 * Style-д `'unsafe-inline'` үлдсэн (React `style=` attribute, Mux player) — style нь script ажиллуулдаггүй.
 */
const MUX = 'https://*.mux.com';
const LITIX = 'https://*.litix.io';
const SUPABASE = 'https://*.supabase.co';

export function buildCsp(nonce: string, isProd: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' дэмждэг browser-т 'self'-ийг үл тооно (nonce-той script-ээс ачаалсан script л ажиллана); хуучин browser-т 'self' fallback.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${SUPABASE} ${MUX} https://qpay.mn https://*.qpay.mn`,
    `media-src 'self' blob: ${MUX}`,
    `connect-src 'self' ${SUPABASE} ${MUX} ${LITIX} https://storage.googleapis.com https://*.googleapis.com https://*.sentry.io${isProd ? '' : ' ws: http://localhost:*'}`,
    `frame-src 'self' ${SUPABASE}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
