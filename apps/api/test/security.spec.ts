import type { Response } from 'express';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { originAllowed } from '../src/configure-app';
import { setAuthCookies } from '../src/auth/cookies';
import { setReferralCookie } from '../src/referrals/cookie';
import { parseEnv } from '../src/env';
import { InMemoryRateLimitStore, RATE_LIMIT_STORE } from '../src/rate-limit/rate-limit.store';
import { createTestApp, loginByEmail, type TestApp } from './harness';

jest.setTimeout(180_000);

describe('Security header, CORS', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ corsOrigins: ['https://lms-git-*-team.vercel.app', 'https://staging.example.mn'] });
  });
  afterAll(() => t.close());

  it('helmet header-үүд тавигдаж, x-powered-by алга', async () => {
    const res = await t.http().get('/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('CORS: WEB_ORIGIN ба allowlist-ийн origin-д зөвшөөрнө', async () => {
    for (const origin of ['http://localhost:3000', 'https://staging.example.mn', 'https://lms-git-feat-x-team.vercel.app']) {
      const res = await t.http().get('/health').set('Origin', origin).expect(200);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    }
  });

  it('CORS: allowlist-д байхгүй origin-д header өгөхгүй (wildcard-ыг хуурч болохгүй)', async () => {
    for (const origin of ['https://evil.example', 'https://lms-git-x.evil.com', 'https://lms-git-a.b-team.vercel.app', 'https://staging.example.mn.evil.com']) {
      const res = await t.http().get('/health').set('Origin', origin).expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('CORS preflight: буруу origin-д allow header алга', async () => {
    const res = await t
      .http()
      .options('/credits/topups')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('originAllowed: pattern-ийн `*` нь "." давж таарахгүй', () => {
    expect(originAllowed('https://a-b.vercel.app', ['https://*.vercel.app'])).toBe(true);
    expect(originAllowed('https://a.b.vercel.app', ['https://*.vercel.app'])).toBe(false);
    expect(originAllowed('https://lms-1.vercel.app', ['https://lms-*.vercel.app'])).toBe(true);
  });
});

describe('Rate limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Бусад тест rate limit-гүй; энд бодитоор асаана.
    process.env.RATE_LIMIT_ENABLED = 'true';
    t = await createTestApp();
  });
  beforeEach(async () => {
    (t.app.get(RATE_LIMIT_STORE) as InMemoryRateLimitStore).clear();
    await t.reset();
  });
  afterAll(async () => {
    await t.close();
    process.env.RATE_LIMIT_ENABLED = 'false';
  });

  it('OTP start: IP тутамд минутад 10, дараагийнх 429 + Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: `rl${i}@example.mn` }).expect(200);
    }
    const res = await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: 'rl-last@example.mn' }).expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('GET (health, catalog) глобал хязгаарт орохгүй', async () => {
    for (let i = 0; i < 15; i++) await t.http().get('/health').expect(200);
  });

  it('Топап: хэрэглэгч тутамд минутад 10, хэтэрвэл 429', async () => {
    const { agent } = await loginByEmail(t, 'payer@example.mn');
    // Хязгаар хэтрэхээс өмнө (багц олдохгүй 4xx) хүсэлт хүртэл нь тоологдоно.
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await agent.post('/credits/topups').send({ packageId: '00000000-0000-4000-8000-000000000000' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('Топап хязгаар хэрэглэгч тус бүрд тусдаа', async () => {
    const a = await loginByEmail(t, 'a@example.mn');
    const b = await loginByEmail(t, 'b@example.mn');
    for (let i = 0; i < 10; i++) await a.agent.post('/credits/topups').send({ packageId: '00000000-0000-4000-8000-000000000000' });
    await a.agent.post('/credits/topups').send({ packageId: '00000000-0000-4000-8000-000000000000' }).expect(429);
    const res = await b.agent.post('/credits/topups').send({ packageId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).not.toBe(429);
  });

  it('Payout хүсэлт: минутад 5-аас хэтрэхгүй', async () => {
    const { agent } = await loginByEmail(t, 'teacher@example.mn');
    await grantRoleByIdentifier(t.prisma, 'teacher@example.mn', 'TEACHER');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await agent.post('/teacher/payouts')).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe('Cookie flags', () => {
  function fakeRes() {
    const cookies: { name: string; value: string; opts: Record<string, unknown> }[] = [];
    const res = { cookie: (name: string, value: string, opts: Record<string, unknown>) => cookies.push({ name, value, opts }) };
    return { res: res as unknown as Response, cookies };
  }

  it('production: auth cookie Secure + HttpOnly + SameSite=Lax', () => {
    const { res, cookies } = fakeRes();
    setAuthCookies(res, { NODE_ENV: 'production', COOKIE_PATH_PREFIX: '/api' }, 'a', 'r');
    expect(cookies).toHaveLength(2);
    for (const c of cookies) expect(c.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
    expect(cookies.find((c) => c.name === 'refresh_token')?.opts.path).toBe('/api/auth');
  });

  it('production: referral cookie Secure + HttpOnly', () => {
    const { res, cookies } = fakeRes();
    setReferralCookie(res, { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }, '00000000-0000-4000-8000-000000000000', new Date(), 30);
    expect(cookies[0]?.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
  });

  it('dev/test: Secure биш (http://localhost дээр cookie тавигдана)', () => {
    const { res, cookies } = fakeRes();
    setAuthCookies(res, { NODE_ENV: 'development', COOKIE_PATH_PREFIX: '' }, 'a', 'r');
    for (const c of cookies) expect(c.opts).toMatchObject({ httpOnly: true, secure: false });
  });
});

describe('Production env шалгалт (fail fast)', () => {
  const full: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://x',
    JWT_SECRET: 'j'.repeat(40),
    WEB_ORIGIN: 'https://lms.example.mn',
    PUBLIC_WEB_URL: 'https://lms.example.mn',
    EMAIL_FROM: 'LMS <noreply@lms.example.mn>',
    VERIFY_MN_API_KEY: 'k',
    RESEND_API_KEY: 'k',
    REDIS_URL: 'redis://localhost:6379',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    QPAY_CLIENT_ID: 'k',
    QPAY_CLIENT_SECRET: 'k',
    QPAY_INVOICE_CODE: 'k',
    MUX_TOKEN_ID: 'k',
    MUX_TOKEN_SECRET: 'k',
    MUX_SIGNING_KEY_ID: 'k',
    MUX_SIGNING_KEY_PRIVATE: 'k',
    MUX_WEBHOOK_SECRET: 'k',
  };

  it('бүрэн тохиргоо давна', () => {
    const env = parseEnv(full);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('түлхүүр дутвал бүгдийг нэрлэж унана', () => {
    const { QPAY_CLIENT_ID: _a, MUX_WEBHOOK_SECRET: _b, REDIS_URL: _c, ...rest } = full;
    expect(() => parseEnv(rest)).toThrow(/QPAY_CLIENT_ID[\s\S]*REDIS_URL|REDIS_URL[\s\S]*QPAY_CLIENT_ID/);
    expect(() => parseEnv(rest)).toThrow(/MUX_WEBHOOK_SECRET/);
  });

  it.each([
    ['WEB_ORIGIN', 'http://localhost:3000'],
    ['PUBLIC_WEB_URL', 'http://lms.example.mn'],
    ['TRUST_PROXY', '0'],
    ['RATE_LIMIT_ENABLED', 'false'],
    ['EMAIL_FROM', 'LMS <onboarding@resend.dev>'],
    ['QPAY_BASE_URL', 'https://merchant-sandbox.qpay.mn'],
  ])('production-д %s=%s зөвшөөрөхгүй', (key, value) => {
    expect(() => parseEnv({ ...full, [key]: value })).toThrow(new RegExp(key));
  });

  it('dev-д localhost, түлхүүргүй асна', () => {
    expect(() => parseEnv({ NODE_ENV: 'development', DATABASE_URL: 'x', JWT_SECRET: 'j'.repeat(40) })).not.toThrow();
  });

  it('CORS_ORIGINS буруу хэлбэрийг (зам агуулсан) татгалзана, зөв бол жагсаалт болгоно', () => {
    const base = { NODE_ENV: 'development', DATABASE_URL: 'x', JWT_SECRET: 'j'.repeat(40) };
    expect(() => parseEnv({ ...base, CORS_ORIGINS: 'https://a.mn/path' })).toThrow(/CORS_ORIGINS/);
    expect(parseEnv({ ...base, CORS_ORIGINS: 'https://a.mn, https://b-*.vercel.app' }).CORS_ORIGINS).toEqual([
      'https://a.mn',
      'https://b-*.vercel.app',
    ]);
  });
});
