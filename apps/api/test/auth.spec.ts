import { Controller, Get, Module } from '@nestjs/common';
import { Auth } from '../src/auth/auth.guard';
import { codeFromEmail, createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

/** Зөвхөн тестэд: role шалгалтыг HTTP-ээр турших endpoint. */
@Controller('__test__/roles')
class RolesProbeController {
  @Get('admin')
  @Auth('ADMIN')
  admin() {
    return { ok: true };
  }

  @Get('teacher-or-admin')
  @Auth('TEACHER', 'ADMIN')
  staff() {
    return { ok: true };
  }
}
@Module({ controllers: [RolesProbeController] })
class RolesProbeModule {}

function cookies(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  return Object.fromEntries(
    raw.map((c) => {
      const [pair, ...attrs] = c.split(';');
      const i = pair!.indexOf('=');
      return [pair!.slice(0, i), [pair!.slice(i + 1), ...attrs].join(';')];
    }),
  );
}
/** Cookie header-т илгээх `name=value` хэлбэр */
const pick = (res: { headers: Record<string, unknown> }, name: string) =>
  `${name}=${cookies(res)[name]?.split(';')[0] ?? ''}`;

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ imports: [RolesProbeModule] });
});
beforeEach(() => t.reset());
afterAll(() => t.close());

describe('Имэйлээр бүртгүүлэх / нэвтрэх', () => {
  it('код имэйлээр ирж, зөв код оруулбал шинэ хэрэглэгч үүсч cookie олгоно', async () => {
    const agent = t.agent();
    const start = await agent.post('/auth/otp/start').send({ type: 'EMAIL', value: ' Bold@Example.MN ' }).expect(200);
    expect(start.body).toMatchObject({ type: 'EMAIL', challengeId: expect.any(String) });
    expect(start.body.phone).toBeUndefined();

    const code = codeFromEmail(t, 'bold@example.mn');
    expect(code).toMatch(/^\d{6}$/);

    const res = await agent.post('/auth/otp/verify').send({ challengeId: start.body.challengeId, code }).expect(200);
    expect(res.body).toMatchObject({
      status: 'verified',
      isNew: true,
      user: { roles: ['LEARNER'], identifiers: [{ type: 'EMAIL', value: 'bold@example.mn' }] },
    });

    const c = cookies(res);
    expect(c.access_token).toMatch(/HttpOnly/i);
    expect(c.refresh_token).toMatch(/HttpOnly/i);
    expect(c.refresh_token).toMatch(/Path=\/auth/);
    expect(c.access_token).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/me').expect(200);
    expect(me.body.id).toBe(res.body.user.id);
  });

  it('дахин нэвтрэхэд ижил хэрэглэгч (isNew=false)', async () => {
    const first = await loginByEmail(t, 'a@example.mn');
    const start = await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: 'A@example.mn' }).expect(200);
    const res = await t
      .http()
      .post('/auth/otp/verify')
      .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, 'a@example.mn') })
      .expect(200);
    expect(res.body.isNew).toBe(false);
    expect(res.body.user.id).toBe(first.user.id);
  });
});

describe('Утсаар бүртгүүлэх / нэвтрэх (verify.mn)', () => {
  it('6 оронтой код + SMS заавар буцааж, SMS ирэх хүртэл pending, дараа нь нэвтэрнэ', async () => {
    const agent = t.agent();
    const start = await agent.post('/auth/otp/start').send({ type: 'PHONE', value: '9911 2233' }).expect(200);
    expect(start.body.phone).toMatchObject({ code: expect.stringMatching(/^\d{6}$/), shortcode: '144773' });
    expect(start.body.phone.smsUri).toContain(start.body.phone.code);
    // verify.mn-д 8 оронтой дугаар, бидний үүсгэсэн код очсон
    expect(t.phone.last()).toMatchObject({ phone: '99112233', code: start.body.phone.code });

    const pending = await agent.post('/auth/otp/verify').send({ challengeId: start.body.challengeId }).expect(202);
    expect(pending.body).toEqual({ status: 'pending' });
    expect(cookies(pending).access_token).toBeUndefined();

    t.phone.markVerified('99112233');
    const res = await agent.post('/auth/otp/verify').send({ challengeId: start.body.challengeId }).expect(200);
    expect(res.body.user.identifiers).toEqual([expect.objectContaining({ type: 'PHONE', value: '+97699112233' })]);
    await agent.get('/me').expect(200);
  });

  it('өөр хэлбэрээр бичсэн ижил дугаар нэг хэрэглэгч', async () => {
    const a = await loginByPhone(t, '+976 8800 1122');
    const b = await loginByPhone(t, '88001122');
    expect(b.user.id).toBe(a.user.id);
  });

  it('verify.mn session хугацаа дууссан бол 410', async () => {
    const start = await t.http().post('/auth/otp/start').send({ type: 'PHONE', value: '99001100' }).expect(200);
    t.phone.markExpired();
    const res = await t.http().post('/auth/otp/verify').send({ challengeId: start.body.challengeId }).expect(410);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('буруу дугаар, буруу имэйл 400', async () => {
    for (const body of [
      { type: 'PHONE', value: '12345' },
      { type: 'PHONE', value: '+1 555 123 4567' },
      { type: 'EMAIL', value: 'not-an-email' },
    ]) {
      const res = await t.http().post('/auth/otp/start').send(body).expect(400);
      expect(res.body.code).toBe('INVALID_IDENTIFIER');
    }
    expect(t.phone.sessions).toHaveLength(0);
    expect(t.email.sent).toHaveLength(0);
  });
});

describe('OTP дүрэм', () => {
  async function startEmail(email = 'x@example.mn') {
    const res = await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: email }).expect(200);
    return { challengeId: res.body.challengeId as string, code: codeFromEmail(t, email) };
  }
  const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  it('буруу код 400, хэрэглэгч үүсэхгүй', async () => {
    const { challengeId, code } = await startEmail();
    const res = await t.http().post('/auth/otp/verify').send({ challengeId, code: wrong(code) }).expect(400);
    expect(res.body.code).toBe('INVALID_CODE');
    expect(await t.prisma.user.count()).toBe(0);
  });

  it('имэйлд код заавал', async () => {
    const { challengeId } = await startEmail();
    const res = await t.http().post('/auth/otp/verify').send({ challengeId }).expect(400);
    expect(res.body.code).toBe('CODE_REQUIRED');
  });

  it('5 буруу оролдлогын дараа зөв код ч хүлээн авахгүй', async () => {
    const { challengeId, code } = await startEmail();
    for (let i = 0; i < 4; i++) {
      await t.http().post('/auth/otp/verify').send({ challengeId, code: wrong(code) }).expect(400);
    }
    await t.http().post('/auth/otp/verify').send({ challengeId, code: wrong(code) }).expect(429);
    const res = await t.http().post('/auth/otp/verify').send({ challengeId, code }).expect(429);
    expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('5 минутын дараа хүчингүй', async () => {
    const { challengeId, code } = await startEmail();
    const challenge = await t.prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.expiresAt.getTime() - challenge.createdAt.getTime()).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(challenge.expiresAt.getTime() - challenge.createdAt.getTime()).toBeLessThanOrEqual(5 * 60_000 + 1000);

    await t.prisma.otpChallenge.update({ where: { id: challengeId }, data: { expiresAt: new Date(Date.now() - 1) } });
    const res = await t.http().post('/auth/otp/verify').send({ challengeId, code }).expect(410);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('нэг удаа л ашиглагдана', async () => {
    const { challengeId, code } = await startEmail();
    await t.http().post('/auth/otp/verify').send({ challengeId, code }).expect(200);
    const res = await t.http().post('/auth/otp/verify').send({ challengeId, code }).expect(410);
    expect(res.body.code).toBe('OTP_USED');
  });

  it('кодыг DB-д ил хадгалахгүй', async () => {
    const { challengeId, code } = await startEmail();
    const row = await t.prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(JSON.stringify(row)).not.toContain(code);
  });

  it('илгээх үйлчилгээ унасан бол 502, тэр challenge ашиглагдахгүй', async () => {
    jest.spyOn(t.email, 'send').mockRejectedValueOnce(new Error('Resend down'));
    const res = await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: 'z@example.mn' }).expect(502);
    expect(res.body.code).toBe('PROVIDER_UNAVAILABLE');
    const row = await t.prisma.otpChallenge.findFirstOrThrow({ where: { value: 'z@example.mn' } });
    expect(row.consumedAt).not.toBeNull();
  });
});

describe('Rate limit', () => {
  it('нэг identifier-т 10 минутад 3 код (IP өөр байсан ч)', async () => {
    for (let i = 0; i < 3; i++) {
      await t
        .http()
        .post('/auth/otp/start')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ type: 'EMAIL', value: 'r@example.mn' })
        .expect(200);
    }
    const res = await t
      .http()
      .post('/auth/otp/start')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({ type: 'EMAIL', value: 'r@example.mn' })
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(t.email.sent).toHaveLength(3);
  });

  it('нэг IP-ээс цагт 20 код; өөр IP хэвийн', async () => {
    for (let i = 0; i < 20; i++) {
      await t
        .http()
        .post('/auth/otp/start')
        .set('X-Forwarded-For', '10.1.1.1')
        .send({ type: 'EMAIL', value: `u${i}@example.mn` })
        .expect(200);
    }
    await t
      .http()
      .post('/auth/otp/start')
      .set('X-Forwarded-For', '10.1.1.1')
      .send({ type: 'EMAIL', value: 'u20@example.mn' })
      .expect(429);
    await t
      .http()
      .post('/auth/otp/start')
      .set('X-Forwarded-For', '10.1.1.2')
      .send({ type: 'EMAIL', value: 'u20@example.mn' })
      .expect(200);
  });
});

describe('Token: refresh rotation, гарах', () => {
  it('нэвтрээгүй бол /me 401, хуурамч token 401', async () => {
    await t.http().get('/me').expect(401);
    await t.http().get('/me').set('Cookie', 'access_token=abc.def.ghi').expect(401);
  });

  it('refresh нь шинэ token олгож, хуучныг дахин ашиглавал family бүхэлдээ хүчингүй', async () => {
    const start = await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: 'rt@example.mn' });
    const login = await t
      .http()
      .post('/auth/otp/verify')
      .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, 'rt@example.mn') })
      .expect(200);
    const refresh1 = pick(login, 'refresh_token');

    const r1 = await t.http().post('/auth/refresh').set('Cookie', refresh1).expect(204);
    const refresh2 = pick(r1, 'refresh_token');
    const access2 = pick(r1, 'access_token');
    expect(refresh2).not.toBe(refresh1);
    await t.http().get('/me').set('Cookie', access2).expect(200);

    // Хуучин token дахин ирлээ → хулгай гэж үзэж бүх family-г хаана
    await t.http().post('/auth/refresh').set('Cookie', refresh1).expect(401);
    await t.http().post('/auth/refresh').set('Cookie', refresh2).expect(401);
  });

  it('refresh token-гүй эсвэл буруу бол 401', async () => {
    await t.http().post('/auth/refresh').expect(401);
    await t.http().post('/auth/refresh').set('Cookie', 'refresh_token=nope').expect(401);
  });

  it('logout нь cookie цэвэрлэж refresh token-ийг хүчингүй болгоно', async () => {
    const { agent } = await loginByEmail(t, 'lo@example.mn');
    await agent.post('/auth/logout').expect(204);
    await agent.get('/me').expect(401);
    await agent.post('/auth/refresh').expect(401);
    expect(await t.prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('бүх төхөөрөмжөөс гарах: бусад төхөөрөмжийн access болон refresh хоёулаа хүчингүй', async () => {
    const laptop = await loginByEmail(t, 'all@example.mn');
    const phone = await loginByEmail(t, 'all@example.mn');
    await phone.agent.get('/me').expect(200);

    await laptop.agent.post('/auth/logout-all').expect(204);

    await phone.agent.get('/me').expect(401);
    await phone.agent.post('/auth/refresh').expect(401);
    await laptop.agent.get('/me').expect(401);

    // Дахин нэвтрэх боломжтой
    const again = await loginByEmail(t, 'all@example.mn');
    await again.agent.get('/me').expect(200);
  });
});

describe('Хоёр дахь identifier холбох', () => {
  it('имэйлтэй хэрэглэгч утсаа холбож, дараа нь утсаар нэвтрэхэд ижил бүртгэл', async () => {
    const { agent, user } = await loginByEmail(t, 'link@example.mn');
    const start = await agent.post('/me/identifiers/start').send({ type: 'PHONE', value: '95005000' }).expect(200);
    await agent.post('/me/identifiers/verify').send({ challengeId: start.body.challengeId }).expect(202);
    t.phone.markVerified('95005000');
    const res = await agent.post('/me/identifiers/verify').send({ challengeId: start.body.challengeId }).expect(200);
    expect(res.body.user.identifiers.map((i: { type: string }) => i.type)).toEqual(['EMAIL', 'PHONE']);

    const byPhone = await loginByPhone(t, '95005000');
    expect(byPhone.user.id).toBe(user.id);
  });

  it('утастай хэрэглэгч имэйлээ кодоор холбоно', async () => {
    const { agent } = await loginByPhone(t, '99998888');
    const start = await agent.post('/me/identifiers/start').send({ type: 'EMAIL', value: 'p@example.mn' }).expect(200);
    const res = await agent
      .post('/me/identifiers/verify')
      .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, 'p@example.mn') })
      .expect(200);
    expect(res.body.user.identifiers).toHaveLength(2);
  });

  it('өөр бүртгэлд байгаа identifier-ийг код илгээхээс өмнө татгалзана', async () => {
    await loginByPhone(t, '88887777');
    const other = await loginByEmail(t, 'other@example.mn');
    const sessionsBefore = t.phone.sessions.length;

    const res = await other.agent
      .post('/me/identifiers/start')
      .send({ type: 'PHONE', value: '+97688887777' })
      .expect(409);
    expect(res.body.code).toBe('IDENTIFIER_TAKEN');
    expect(t.phone.sessions).toHaveLength(sessionsBefore);
  });

  it('холбох явцад өөр хэрэглэгч түрүүлж бүртгүүлсэн бол 409', async () => {
    const { agent } = await loginByEmail(t, 'race@example.mn');
    const start = await agent.post('/me/identifiers/start').send({ type: 'PHONE', value: '91112222' }).expect(200);
    t.phone.markVerified('91112222');
    await loginByPhone(t, '91112222'); // өөр хүн энэ дугаараар бүртгүүлчихлээ
    const res = await agent.post('/me/identifiers/verify').send({ challengeId: start.body.challengeId }).expect(409);
    expect(res.body.code).toBe('IDENTIFIER_TAKEN');
  });

  it('ижил төрлийн identifier аль хэдийн байвал 409', async () => {
    const { agent } = await loginByEmail(t, 'one@example.mn');
    const res = await agent.post('/me/identifiers/start').send({ type: 'EMAIL', value: 'two@example.mn' }).expect(409);
    expect(res.body.code).toBe('ALREADY_LINKED');
  });

  it('холбох код нэвтрэхэд ашиглагдахгүй, өөр хэрэглэгч ашиглаж чадахгүй', async () => {
    const { agent } = await loginByEmail(t, 'owner@example.mn');
    const start = await agent.post('/me/identifiers/start').send({ type: 'PHONE', value: '90001111' }).expect(200);
    t.phone.markVerified('90001111');

    await t.http().post('/auth/otp/verify').send({ challengeId: start.body.challengeId }).expect(404);
    const intruder = await loginByEmail(t, 'intruder@example.mn');
    await intruder.agent.post('/me/identifiers/verify').send({ challengeId: start.body.challengeId }).expect(404);
  });

  it('нэвтрээгүй бол 401', async () => {
    await t.http().post('/me/identifiers/start').send({ type: 'EMAIL', value: 'a@b.mn' }).expect(401);
  });
});

describe('Profile', () => {
  it('нэр, avatar засна', async () => {
    const { agent } = await loginByEmail(t, 'pr@example.mn');
    const res = await agent
      .patch('/me')
      .send({ name: '  Болд  ', avatarUrl: 'https://cdn.example.mn/a.png' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Болд', avatarUrl: 'https://cdn.example.mn/a.png' });

    const cleared = await agent.patch('/me').send({ avatarUrl: null }).expect(200);
    expect(cleared.body).toMatchObject({ name: 'Болд', avatarUrl: null });
  });

  it('буруу утга 400; role-ийг өөрөө өөрчилж чадахгүй', async () => {
    const { agent } = await loginByEmail(t, 'pr2@example.mn');
    await agent.patch('/me').send({ name: '' }).expect(400);
    await agent.patch('/me').send({ avatarUrl: 'javascript:alert(1)' }).expect(400);
    await agent.patch('/me').send({ avatarUrl: 'http://insecure.mn/a.png' }).expect(400);
    await agent.patch('/me').send({ roles: ['ADMIN'] }).expect(400);
    const me = await agent.get('/me').expect(200);
    expect(me.body.roles).toEqual(['LEARNER']);
  });
});

describe('Role', () => {
  it('анхдагч learner; шаардлагатай role байхгүй бол 403, олгосны дараа 200', async () => {
    const { agent, user } = await loginByEmail(t, 'role@example.mn');
    expect(user.roles).toEqual(['LEARNER']);

    await agent.get('/__test__/roles/admin').expect(403);
    await agent.get('/__test__/roles/teacher-or-admin').expect(403);

    await t.prisma.user.update({ where: { id: user.id }, data: { roles: ['LEARNER', 'TEACHER'] } });
    await agent.get('/__test__/roles/teacher-or-admin').expect(200);
    await agent.get('/__test__/roles/admin').expect(403);

    await t.prisma.user.update({ where: { id: user.id }, data: { roles: ['LEARNER', 'ADMIN'] } });
    await agent.get('/__test__/roles/admin').expect(200);
  });

  it('нэвтрээгүй бол 401', async () => {
    await t.http().get('/__test__/roles/admin').expect(401);
  });
});
