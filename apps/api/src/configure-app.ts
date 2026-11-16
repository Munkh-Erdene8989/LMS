import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './env';

/** main.ts болон тест хоёулаа ижил тохиргоотой апп үүсгэхийн тулд энд төвлөрүүлнэ. */
export function configureApp(app: INestApplication, env: Pick<Env, 'WEB_ORIGIN' | 'TRUST_PROXY'>): void {
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  // Proxy-ийн ард: rate limit-д бодит client IP (`X-Forwarded-For`).
  (app as NestExpressApplication).set('trust proxy', env.TRUST_PROXY);
  app.enableShutdownHooks();
}
