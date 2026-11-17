import 'reflect-metadata';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_SENDER, FakeEmailSender } from '../src/adapters/email';
import { FakePhoneVerifier, PHONE_VERIFIER } from '../src/adapters/phone-verifier';
import { FakeStorage, STORAGE } from '../src/adapters/storage';
import { FakeQPay, QPAY } from '../src/adapters/qpay';
import { FakeMux, MUX } from '../src/adapters/mux';
import { InMemoryPlaybackSessionStore, PLAYBACK_SESSIONS } from '../src/media/playback-sessions';
import { InMemoryJobQueue } from '../src/queue/in-memory-queue';
import { JOB_QUEUE } from '../src/queue/job-queue';

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  /** Cookie хадгалдаг client — нэг "хөтөч"-ийг дуурайна. */
  agent: () => ReturnType<typeof request.agent>;
  prisma: PrismaService;
  phone: FakePhoneVerifier;
  email: FakeEmailSender;
  /** Гараар удирддаг дараалал: `t.queue.drain()` хүлээгдэж буй ажлуудыг ажиллуулна. */
  queue: InMemoryJobQueue;
  /** `t.storage.put(bucket, key, info)` — browser upload хийсэн мэт */
  storage: FakeStorage;
  /** `t.qpay.markPaid(invoiceId)` — хэрэглэгч банкны апп-аар төлсөн мэт */
  qpay: FakeQPay;
  /** `t.mux.signedWebhook(event)` — Mux webhook; `t.mux.setAsset(...)` — Mux API-ийн төлөв */
  mux: FakeMux;
  /** Тоглуулалтын heartbeat slot-ууд; `t.playback.advance(ms)` — цаг урагшлуулна */
  playback: InMemoryPlaybackSessionStore;
  /** Тестийн schema-ийн бүх хүснэгтийг цэвэрлэж, fake-уудыг хоосолно. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

type Builder = ReturnType<typeof Test.createTestingModule>;

export interface TestAppOptions {
  override?: (builder: Builder) => Builder;
  /** Зөвхөн тестэд хэрэгтэй нэмэлт модуль (жишээ нь role шалгах туршилтын controller). */
  imports?: Type<unknown>[];
}

/**
 * Тестийн цорын ганц seam: бодит AppModule + бодит Postgres (тестийн schema),
 * гадны сервисүүд fake. Тест зөвхөн HTTP-ээр харилцана.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const phone = new FakePhoneVerifier();
  const email = new FakeEmailSender();
  const queue = new InMemoryJobQueue('manual');
  const storage = new FakeStorage();
  const qpay = new FakeQPay();
  const mux = new FakeMux();
  const playback = new InMemoryPlaybackSessionStore();

  let builder = Test.createTestingModule({ imports: [AppModule, ...(options.imports ?? [])] })
    .overrideProvider(PHONE_VERIFIER)
    .useValue(phone)
    .overrideProvider(EMAIL_SENDER)
    .useValue(email)
    .overrideProvider(JOB_QUEUE)
    .useValue(queue)
    .overrideProvider(STORAGE)
    .useValue(storage)
    .overrideProvider(QPAY)
    .useValue(qpay)
    .overrideProvider(MUX)
    .useValue(mux)
    .overrideProvider(PLAYBACK_SESSIONS)
    .useValue(playback);
  if (options.override) builder = options.override(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  configureApp(app, { WEB_ORIGIN: 'http://localhost:3000', TRUST_PROXY: 1 });
  await app.init();

  const prisma = app.get(PrismaService);
  const server = app.getHttpServer();

  return {
    app,
    http: () => request(server),
    agent: () => request.agent(server),
    prisma,
    phone,
    email,
    queue,
    storage,
    qpay,
    mux,
    playback,
    reset: async () => {
      await truncateAll(prisma);
      phone.clear();
      email.clear();
      queue.clear();
      storage.clear();
      qpay.clear();
      mux.clear();
      playback.clear();
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

/** Имэйлээс 6 оронтой кодыг гаргана. */
export function codeFromEmail(t: TestApp, to: string): string {
  const msg = t.email.last(to);
  const code = msg?.text?.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`${to} руу код илгээгдээгүй`);
  return code;
}

/** Имэйлээр бүрэн нэвтэрсэн agent буцаана. */
export async function loginByEmail(t: TestApp, email: string, agent = t.agent()) {
  const start = await agent.post('/auth/otp/start').send({ type: 'EMAIL', value: email }).expect(200);
  const res = await agent
    .post('/auth/otp/verify')
    .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, email) })
    .expect(200);
  return { agent, user: res.body.user };
}

/** Утсаар бүрэн нэвтэрсэн agent буцаана (хэрэглэгч SMS илгээсэн мэт). */
export async function loginByPhone(t: TestApp, phone: string, agent = t.agent()) {
  const start = await agent.post('/auth/otp/start').send({ type: 'PHONE', value: phone }).expect(200);
  t.phone.markVerified();
  const res = await agent.post('/auth/otp/verify').send({ challengeId: start.body.challengeId }).expect(200);
  return { agent, user: res.body.user };
}
