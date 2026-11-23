import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

// Local хөгжүүлэлтэд monorepo-ийн root `.env`-ийг уншина. Vercel дээр env-ийг платформ өгнө.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

// Vercel (preview/production) дээр API_URL заавал — дутвал server render ба `/api/*` proxy localhost руу явна.
if (process.env.VERCEL_ENV && !process.env.API_URL) {
  throw new Error('API_URL тохируулаагүй байна (Vercel → Settings → Environment Variables; жишээ: https://api.example.mn). Build-ийн өмнө заавал.');
}

/** Content-Security-Policy нь nonce-тэй тул хүсэлт бүрт middleware.ts-д (lib/csp.ts) тавигдана. */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@lms/shared'],
  // Түр demo (ticket 33b): флаг тохируулаагүй үед ч хоосон тэмдэгт болгон шингээнэ — тэгэхгүй бол bundler `process.env.NEXT_PUBLIC_DEMO_DATA`-г
  // тогтмол болгохгүй, demo модуль dead-code болж хасагдахгүй. Устгах заавар: .scratch/lms/issues/33b-demo-data.md.
  env: { NEXT_PUBLIC_DEMO_DATA: process.env.NEXT_PUBLIC_DEMO_DATA ?? '' },
  poweredByHeader: false,
  // Browser API руу шууд биш, web-ийн `/api/*`-аар хандана → auth cookie first-party. Proxy нь
  // `app/api/[...path]/route.ts` (function-ийн бүсээс дуудна; гадны rewrite Railway-д Европын edge-ээр ордог байсан).
  // API-ийн `COOKIE_PATH_PREFIX` нь энэ угтвартай (`/api`) таарах ёстой.
  async headers() {
    return [
      // /api/* нь API-ийн (helmet) header-тэй; хуудсуудын CSP нь middleware-ээс.
      { source: '/((?!api/).*)', headers: securityHeaders },
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
