import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

// Local хөгжүүлэлтэд monorepo-ийн root `.env`-ийг уншина. Vercel дээр env-ийг платформ өгнө.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Vercel (preview/production) дээр API_URL заавал — rewrite build үед шингэдэг тул дутвал `/api/*` localhost руу явна.
if (process.env.VERCEL_ENV && !process.env.API_URL) {
  throw new Error('API_URL тохируулаагүй байна (Vercel → Settings → Environment Variables; жишээ: https://api.example.mn). Build-ийн өмнө заавал.');
}
const isProd = process.env.NODE_ENV === 'production';

/**
 * Content-Security-Policy (ticket 23). Нийтлэг:
 * - Mux player: HLS `stream.mux.com` (MSE → blob:), poster `image.mux.com`, Mux Data `*.litix.io`; Mux direct upload (browser PUT) GCS руу.
 * - QPay: QR нь `data:` зураг, банкны лого `qpay.mn`; deeplink нь навигаци (CSP-д хамаарахгүй).
 * - Supabase Storage: signed upload (`connect-src`), зураг/PDF (`img-src`, `frame-src`).
 * - Sentry: `*.sentry.io` (зөвхөн DSN тохируулсан үед ашиглагдана).
 * Next.js өөрийн inline script бичдэг тул `script-src 'unsafe-inline'`; nonce-д шилжих нь (middleware) дараагийн алхам — docs/DEPLOY.md.
 */
const MUX = 'https://*.mux.com';
const LITIX = 'https://*.litix.io';
const SUPABASE = 'https://*.supabase.co';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
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

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@lms/shared'],
  poweredByHeader: false,
  /**
   * Browser API руу шууд биш, web-ийн `/api/*`-аар хандана → auth cookie first-party.
   * API-ийн `COOKIE_PATH_PREFIX` нь энэ угтвартай (`/api`) таарах ёстой.
   * `API_URL` нь build үед rewrite-д шингэдэг тул Vercel дээр build-ийн өмнө тохируулсан байх ёстой.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [
      // /api/* нь API-ийн (helmet) header-тэй; хуудсуудад CSP нэмнэ.
      { source: '/((?!api/).*)', headers: [...securityHeaders, { key: 'Content-Security-Policy', value: csp }] },
      { source: '/api/:path*', headers: securityHeaders },
    ];
  },
};

/**
 * Source map-ыг Sentry-д зөвхөн `SENTRY_AUTH_TOKEN` тохируулсан үед (Vercel build) илгээнэ; үгүй бол энгийн тохиргоо.
 * Upload-ын дараа .map файлыг устгана (browser-т ил гарахгүй).
 */
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA },
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      widenClientFileUpload: true,
      telemetry: false,
      silent: !process.env.CI,
    })
  : nextConfig;
