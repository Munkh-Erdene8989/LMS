import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_SENDER, FakeEmailSender } from '../src/adapters/email';
import { FakeSmsSender, SMS_SENDER } from '../src/adapters/sms';

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  sms: FakeSmsSender;
  email: FakeEmailSender;
  /** Тестийн schema-ийн бүх хүснэгтийг цэвэрлэж, fake-уудыг хоосолно. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

type Override = (builder: ReturnType<typeof Test.createTestingModule>) => ReturnType<typeof Test.createTestingModule>;

/**
 * Тестийн цорын ганц seam: бодит AppModule + бодит Postgres (тестийн schema),
 * гадны сервисүүд fake. Тест зөвхөн HTTP-ээр харилцана.
 */
export async function createTestApp(override?: Override): Promise<TestApp> {
  const sms = new FakeSmsSender();
  const email = new FakeEmailSender();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_SENDER)
    .useValue(sms)
    .overrideProvider(EMAIL_SENDER)
    .useValue(email);
  if (override) builder = override(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { WEB_ORIGIN: 'http://localhost:3000' });
  await app.init();

  const prisma = app.get(PrismaService);
  const server = app.getHttpServer();

  return {
    app,
    http: () => request(server),
    prisma,
    sms,
    email,
    reset: async () => {
      await truncateAll(prisma);
      sms.clear();
      email.clear();
    },
    close: () => app.close(),
  };
}

async function truncateAll(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
