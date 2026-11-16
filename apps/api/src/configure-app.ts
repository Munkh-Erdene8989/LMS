import type { INestApplication } from '@nestjs/common';
import type { Env } from './env';

/** main.ts болон тест хоёулаа ижил тохиргоотой апп үүсгэхийн тулд энд төвлөрүүлнэ. */
export function configureApp(app: INestApplication, env: Pick<Env, 'WEB_ORIGIN'>): void {
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
}
