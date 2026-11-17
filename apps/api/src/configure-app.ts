import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from './env';

export type AppConfig = Pick<Env, 'WEB_ORIGIN' | 'TRUST_PROXY'> & Partial<Pick<Env, 'CORS_ORIGINS' | 'NODE_ENV'>>;

const escapeRegex = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** `https://lms-git-*-team.vercel.app` гэх мэт `*`-тэй pattern-д таарах эсэх (`*` нь `.`/`/`-гүй хэсэг). */
export function originAllowed(origin: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => {
    if (!entry.includes('*')) return entry === origin;
    return new RegExp('^' + entry.split('*').map(escapeRegex).join('[\\w-]*') + '$').test(origin);
  });
}

/** main.ts болон тест хоёулаа ижил тохиргоотой апп үүсгэхийн тулд энд төвлөрүүлнэ. */
export function configureApp(app: INestApplication, env: AppConfig): void {
  const express = app as NestExpressApplication;
  // JSON API: HTML/script ачаалдаггүй тул CSP хамгийн хатуу; frame-д оруулахгүй. Файл (PDF, зураг) web-ийн /api proxy-оор тэр origin-оос ирнэ.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  // CORS allowlist: зөвхөн WEB_ORIGIN + CORS_ORIGINS. Origin-гүй (server-to-server, webhook, curl) хүсэлт CORS-д хамаарахгүй.
  const allowlist = [env.WEB_ORIGIN, ...(env.CORS_ORIGINS ?? [])];
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, !origin || originAllowed(origin, allowlist)),
    credentials: true,
    maxAge: 600,
  });
  // Proxy-ийн ард: rate limit-д бодит client IP (`X-Forwarded-For`).
  express.set('trust proxy', env.TRUST_PROXY);
  // Dev storage (LocalDiskStorage) файл upload: PDF, зургийг raw body-оор хүлээн авна.
  express.useBodyParser('raw', { type: ['application/pdf', 'image/*'], limit: '60mb' });
  app.enableShutdownHooks();
}
