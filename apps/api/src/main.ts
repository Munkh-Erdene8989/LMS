// Заавал хамгийн эхэнд: Sentry-г бусад модулиас өмнө эхлүүлнэ.
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseEnv } from './env';
import { configureApp } from './configure-app';

async function bootstrap() {
  const env = parseEnv();
  // rawBody: Mux webhook-ийн гарын үсгийг яг ирсэн body-оор шалгана.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app, env);
  // Railway PORT-г өгнө. Host заахгүй: Node dual-stack (::) дээр сонсож, Railway-ийн private network (IPv6) ажиллана.
  await app.listen(env.PORT);
  console.log(`API: port ${env.PORT}`);
}

void bootstrap();
