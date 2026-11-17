import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { ENV, type Env } from '../src/env';
import { encodeReferralCookie, REFERRAL_COOKIE } from '../src/referrals/cookie';
import { ReferralsService } from '../src/referrals/referrals.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
jest.setTimeout(180_000);

let t: TestApp;
let credits: CreditsService;
let referrals: ReferralsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
  referrals = t.app.get(ReferralsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

const DAY_MS = 86_400_000;
let seq = 0;

// ---------------------------------------------------------------------------
// Fixture-ууд (purchases.spec.ts-тэй ижил): курс DB-д шууд, кредит CreditsService-ээр.
// ---------------------------------------------------------------------------

async function teacher(email: string) {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

async function grant(userId: string, amount: number) {
  await t.prisma.$transaction(
    (tx) => credits.grant(tx, { userId, credits: amount, source: 'ADMIN_ADJUST' }),
    CREDIT_TX_OPTIONS,
  );
}

async function learner(email = 'learner@example.mn', balance = 100, agent?: Agent) {
  const s = await loginByEmail(t, email, agent);
  await grant(s.user.id, balance);
  return s;
}

/** Нэг хичээлтэй (5 кредит) нийтлэгдсэн курс */
async function course(teacherId: string) {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Курс ${++seq}`,
      priceCredits: 12,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const lesson = await t.prisma.lesson.create({
    data: {
      courseId: row.id,
      sectionId: row.sections[0]!.id,
      title: 'Хичээл 1',
      type: 'TEXT',
      position: 0,
      priceCredits: 5,
      reviewStatus: 'APPROVED',
      content: { markdown: 'агуулга' },
    },
  });
  return { id: row.id, lessonId: lesson.id };
}

const confirm = (expectedCredits: number) => ({ confirmNoRefund: true, expectedCredits });
const buyLesson = (a: Agent, id: string) => a.post(`/purchases/lessons/${id}`).send(confirm(5)).expect(201);
const buyCourse = (a: Agent, id: string, expected: number) =>
  a.post(`/purchases/courses/${id}`).send(confirm(expected)).expect(201);

async function linkOf(a: Agent): Promise<string> {
  return (await a.get('/teacher/referral').expect(200)).body.code;
}

async function purchaseOf(id: string) {
  const purchase = await t.prisma.purchase.findUniqueOrThrow({ where: { id } });
  const earning = await t.prisma.teacherEarningEntry.findFirstOrThrow({ where: { purchaseId: id } });
  return { purchase, earning };
}

function refCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  return list.find((c) => c.startsWith(`${REFERRAL_COOKIE}=`));
}

// ---------------------------------------------------------------------------

describe('Багшийн referral линк', () => {
  it('тогтмол код, тохиргооны хувь/хугацаа; багш биш бол 403', async () => {
    const a = await teacher('a@example.mn');
    const first = (await a.agent.get('/teacher/referral').expect(200)).body;
    expect(first).toMatchObject({
      path: `/r/${first.code}`,
      windowDays: 30,
      commissionReferralPercent: 10,
      commissionPlatformPercent: 40,
      stats: { learners: 0, activeLearners: 0, referralSales: 0, platformSales: 0 },
    });
    expect(first.code).toMatch(/^[a-z0-9]{8}$/);
    expect((await a.agent.get('/teacher/referral').expect(200)).body.code).toBe(first.code);

    const u = await loginByEmail(t, 'u@example.mn');
    await u.agent.get('/teacher/referral').expect(403);
    await t.http().get('/teacher/referral').expect(401);
  });

  it('буруу код → 404; TEACHER эрхгүй болсон багшийн код → 404', async () => {
    const a = await teacher('a@example.mn');
    const code = await linkOf(a.agent);
    await t.http().post('/referrals/visit').send({ code: 'zzzzzzzz' }).expect(404);
    await t.http().post('/referrals/visit').send({ code: 'bad!' }).expect(400);
    await t.prisma.user.update({ where: { id: a.user.id }, data: { roles: [] } });
    await t.http().post('/referrals/visit').send({ code }).expect(404);
  });
});

describe('Attribution худалдан авалтад', () => {
  it('хугацаанд: нэвтэрсэн хэрэглэгч линкээр орж авбал REFERRAL, 10% шимтгэл, орлогын бичилтэд хадгална', async () => {
    const a = await teacher('a@example.mn');
    const c = await course(a.user.id);
    const u = await learner();

    const visit = await u.agent.post('/referrals/visit').send({ code: (await linkOf(a.agent)).toUpperCase() }).expect(200);
    expect(visit.body).toEqual({ teacherId: a.user.id });
    expect(refCookie(visit)).toBeUndefined(); // нэвтэрсэн → шууд DB-д
    expect(await t.prisma.referralAttribution.findFirst()).toMatchObject({ userId: u.user.id, teacherId: a.user.id });

    const res = (await buyLesson(u.agent, c.lessonId)).body;
    const { purchase, earning } = await purchaseOf(res.purchase.id);
    expect(purchase).toMatchObject({ attribution: 'REFERRAL', referrerId: a.user.id, commissionPercent: 10 });
    // 5 кредит × 1000₮ × 90%
    expect(earning).toMatchObject({ attribution: 'REFERRAL', commissionPercent: 10, grossMnt: 5000, amountMnt: 4500 });

    const link = (await a.agent.get('/teacher/referral').expect(200)).body;
    expect(link.stats).toEqual({ learners: 1, activeLearners: 1, referralSales: 1, platformSales: 0 });
  });

  it('өөр багшийн курс: A-гийн линкээр орсон ч B-гийн курс PLATFORM (40%)', async () => {
    const a = await teacher('a@example.mn');
    const b = await teacher('b@example.mn');
    const cb = await course(b.user.id);
    const u = await learner();
    await u.agent.post('/referrals/visit').send({ code: await linkOf(a.agent) }).expect(200);

    const res = (await buyCourse(u.agent, cb.id, 12)).body;
    const { purchase, earning } = await purchaseOf(res.purchase.id);
    expect(purchase).toMatchObject({ attribution: 'PLATFORM', referrerId: null, commissionPercent: 40, teacherId: b.user.id });
    expect(earning).toMatchObject({ teacherId: b.user.id, attribution: 'PLATFORM', amountMnt: 7200 });
  });

  it('хугацаа өнгөрсөн: 31 хоногийн өмнө орсон бол PLATFORM; админ хугацааг 60 хоног болговол REFERRAL', async () => {
    const a = await teacher('a@example.mn');
    const c1 = await course(a.user.id);
    const c2 = await course(a.user.id);
    const u = await learner();
    await u.agent.post('/referrals/visit').send({ code: await linkOf(a.agent) }).expect(200);
    const old = new Date(Date.now() - 31 * DAY_MS);
    await t.prisma.referralAttribution.updateMany({ data: { firstSeenAt: old, lastSeenAt: old } });

    const p1 = (await buyLesson(u.agent, c1.lessonId)).body.purchase;
    expect((await purchaseOf(p1.id)).purchase).toMatchObject({ attribution: 'PLATFORM', commissionPercent: 40 });
    expect((await a.agent.get('/teacher/referral').expect(200)).body.stats).toMatchObject({ learners: 1, activeLearners: 0 });

    const admin = await loginByEmail(t, 'admin@example.mn');
    await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
    await admin.agent.put('/admin/settings/referralWindowDays').send({ value: 60 }).expect(200);
    await admin.agent.put('/admin/settings/commissionReferralPercent').send({ value: 15 }).expect(200);

    const p2 = (await buyLesson(u.agent, c2.lessonId)).body.purchase;
    expect((await purchaseOf(p2.id)).purchase).toMatchObject({ attribution: 'REFERRAL', commissionPercent: 15 });
    // Хуучин худалдан авалт өөрчлөгдөхгүй
    expect((await purchaseOf(p1.id)).purchase).toMatchObject({ attribution: 'PLATFORM', commissionPercent: 40 });
  });

  it('дахин орвол хугацаа шинэчлэгдэнэ (сүүлд орсноос тоолно)', async () => {
    const a = await teacher('a@example.mn');
    const c = await course(a.user.id);
    const u = await learner();
    const code = await linkOf(a.agent);
    await u.agent.post('/referrals/visit').send({ code }).expect(200);
    const old = new Date(Date.now() - 40 * DAY_MS);
    await t.prisma.referralAttribution.updateMany({ data: { firstSeenAt: old, lastSeenAt: old } });

    await u.agent.post('/referrals/visit').send({ code }).expect(200);
    const row = await t.prisma.referralAttribution.findFirstOrThrow();
    expect(row.firstSeenAt).toEqual(old);
    expect(Date.now() - row.lastSeenAt.getTime()).toBeLessThan(60_000);

    const p = (await buyLesson(u.agent, c.lessonId)).body.purchase;
    expect((await purchaseOf(p.id)).purchase.attribution).toBe('REFERRAL');
  });
});

describe('Зочин (cookie)', () => {
  it('нэвтрээгүй орсон → cookie; нэвтрэхэд DB-д шилжиж, худалдан авалт REFERRAL', async () => {
    const a = await teacher('a@example.mn');
    const c = await course(a.user.id);
    const browser = t.agent();

    const visit = await browser.post('/referrals/visit').send({ code: await linkOf(a.agent) }).expect(200);
    const cookie = refCookie(visit)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/); // 30 хоног
    expect(await t.prisma.referralAttribution.count()).toBe(0);

    const u = await learner('learner@example.mn', 100, browser);
    expect(await t.prisma.referralAttribution.findFirst()).toMatchObject({ userId: u.user.id, teacherId: a.user.id });

    const p = (await buyLesson(u.agent, c.lessonId)).body.purchase;
    expect((await purchaseOf(p.id)).purchase).toMatchObject({ attribution: 'REFERRAL', referrerId: a.user.id });
  });

  it('нэвтрэлтээр шилжээгүй cookie худалдан авах үед шилжинэ', async () => {
    const a = await teacher('a@example.mn');
    const c = await course(a.user.id);
    const browser = t.agent();
    await browser.post('/referrals/visit').send({ code: await linkOf(a.agent) }).expect(200);
    const u = await learner('learner@example.mn', 100, browser);
    await t.prisma.referralAttribution.deleteMany(); // нэвтрэлтийн үеийн шилжүүлэлт амжаагүй мэт

    const p = (await buyLesson(u.agent, c.lessonId)).body.purchase;
    expect((await purchaseOf(p.id)).purchase.attribution).toBe('REFERRAL');
    expect(await t.prisma.referralAttribution.count()).toBe(1);
  });

  it('хуурамч / хугацаа сунгасан cookie-г үл тооно; хуучин cookie-ийн огноо хадгалагдана', async () => {
    const a = await teacher('a@example.mn');
    await linkOf(a.agent);
    const u = await loginByEmail(t, 'u@example.mn');
    const now = new Date();
    const valid = encodeReferralCookie(t.app.get<Env>(ENV).JWT_SECRET, a.user.id, new Date(now.getTime() - 40 * DAY_MS));
    const [id, ms, sig] = valid.split('.');

    await referrals.claimCookie(t.prisma, u.user.id, `${id}.${now.getTime()}.${sig}`, now); // огноо зассан
    await referrals.claimCookie(t.prisma, u.user.id, encodeReferralCookie('x'.repeat(40), a.user.id, now), now);
    await referrals.claimCookie(t.prisma, u.user.id, 'garbage', now);
    expect(await t.prisma.referralAttribution.count()).toBe(0);

    await referrals.claimCookie(t.prisma, u.user.id, `${id}.${ms}.${sig}`, now);
    const row = await t.prisma.referralAttribution.findFirstOrThrow();
    expect(row.lastSeenAt.getTime()).toBe(Number(ms)); // 40 хоногийн өмнө → хугацаа өнгөрсөн
  });

  it('багш өөрийн линкээр орвол бүртгэхгүй, cookie тавихгүй', async () => {
    const a = await teacher('a@example.mn');
    const res = await a.agent.post('/referrals/visit').send({ code: await linkOf(a.agent) }).expect(200);
    expect(refCookie(res)).toBeUndefined();
    expect(await t.prisma.referralAttribution.count()).toBe(0);
  });
});
