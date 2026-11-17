import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotenv, parseEnv } from './env';
import { configureApp } from './configure-app';

async function bootstrap() {
  loadDotenv();
  const env = parseEnv();
  // rawBody: Mux webhook-ийн гарын үсгийг яг ирсэн body-оор шалгана.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app, env);
  await app.listen(env.PORT);
  console.log(`API: http://localhost:${env.PORT}`);
}

void bootstrap();
