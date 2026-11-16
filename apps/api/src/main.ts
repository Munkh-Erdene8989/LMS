import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotenv, parseEnv } from './env';
import { configureApp } from './configure-app';

async function bootstrap() {
  loadDotenv();
  const env = parseEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app, env);
  await app.listen(env.PORT);
  console.log(`API: http://localhost:${env.PORT}`);
}

void bootstrap();
