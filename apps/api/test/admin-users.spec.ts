import { randomBytes, randomUUID } from 'node:crypto';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { codeFromEmail, createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
jest.setTimeout(240_000);

let t: TestApp;
let credits: CreditsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];
const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const BANK = { bank: 'KHAN', accountNumber: '5000123456', holderName: 'Бат-Эрдэнэ Д.' };

// ---------------------------------------------------------------------------
// Fixture-ууд
// ---------------------------------------------------------------------------

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  await s.agent.put('/teacher/bank-account').send(BANK).expect(200);
  return s;
}

async function createPackage(a: Agent, body: Record<string, unknown>) {
  return (
    await a
      .post('/admin/credit-packages')
      .send({ name: 'Багц', credits: 10, priceMnt: 10_000, ...body })
      .expect(201)
  ).body as { id: string };
}

/** Нэхэмжлэх үүсгэнэ → { id, invoiceId } (төлөгдөөгүй) */
async function startTopup(agent: Agent, packageId: string) {
  const topup = (await agent.post('/credits/topups').send({ packageId }).expect(201)).body as { id: string };
  return { id: topup.id, invoiceId: t.qpay.last()!.invoiceId };
}

/** Цэнэглээд төлнө (QPay → check) */
async function paidTopup(agent: Agent, packageId: string) {
  const { id, invoiceId } = await startTopup(agent, packageId);
  t.qpay.markPaid(invoiceId);
  await agent.post(`/credits/topups/${id}/check`).expect(200);
  return id;
}

async function grantLot(userId: string, n: number, opts: { isTest?: boolean; validityMonths?: number; now?: Date } = {}) {
  return t.prisma.$transaction(
    (tx) => credits.grant(tx, { userId, credits: n, source: 'ADMIN_ADJUST', ...opts }),
    CREDIT_TX_OPTIONS,
  );
}

async function course(teacherId: string, prices: number[]) {
  const c = await t.prisma.course.create({
    data: {
      teacherId,
      title: 'Англи хэл',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1', position: 0 } },
    },
    include: { sections: true },
  });
  const lessons = [];
  for (const [i, price] of prices.entries()) {
    lessons.push(
      await t.prisma.lesson.create({
        data: {
          courseId: c.id,
          sectionId: c.sections[0]!.id,
          title: `Хичээл ${i + 1}`,
          type: 'TEXT',
          position: i,
          priceCredits: price,
          reviewStatus: 'APPROVED',
          content: { markdown: 'x' },
        },
      }),
    );
  }
  return { course: c, lessons };
}

const buy = (a: Agent, lessonId: string, expected: number) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: expected }).expect(201);

const balanceOf = (userId: string) => credits.balance(userId);

// ---------------------------------------------------------------------------

describe('Эрх', () => {
  it('админ биш → 403, нэвтрээгүй → 401 (бүх шинэ endpoint)', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    const id = u.user.id;
    const calls: [method: 'get' | 'post', path: string, body?: object][] = [
      ['get', '/admin/users?q=a'],
      ['get', `/admin/users/${id}`],
      ['post', `/admin/users/${id}/block`, { reason: 'шалгалт' }],
      ['post', `/admin/users/${id}/unblock`, { reason: 'шалгалт' }],
      ['post', `/admin/users/${id}/credits/adjust`, { delta: 100, reason: 'өөртөө' }],
      ['post', `/admin/users/${id}/earnings/adjust`, { amountMnt: 100, reason: 'өөртөө' }],
      ['get', '/admin/payments/issues'],
      ['post', '/admin/payments/reconcile-canceled'],
      ['post', `/admin/payments/${randomUUID()}/recheck`],
      ['post', `/admin/payments/${randomUUID()}/resolve`, { action: 'GRANT', note: 'өөртөө' }],
      ['get', '/admin/reports/summary'],
      ['get', '/admin/overview'],
      ['get', '/admin/reports/expired-credits'],
    ];
    for (const [method, path, body] of calls) {
      const res = await u.agent[method](path).send(body);
      expect([path, res.status]).toEqual([path, 403]);
      await t.http()[method](path).send(body).expect(401);
    }
    expect(await balanceOf(id)).toBe(0);
    expect(await t.prisma.creditLedgerEntry.count()).toBe(0);
    expect(await t.prisma.teacherEarningEntry.count()).toBe(0);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id } })).blockedAt).toBeNull();
  });
});

describe('Хэрэглэгч хайх, дэлгэрэнгүй', () => {
  it('утас (хэсэг), имэйл, нэр, id-аар олно; дэлгэрэнгүйд баланс, худалдан авалт, төлбөр', async () => {
    const a = await admin();
    const p = await loginByPhone(t, '99112233');
    const e = await loginByEmail(t, 'bold@example.mn');
    await t.prisma.user.update({ where: { id: e.user.id }, data: { name: 'Болд Батын' } });
    await grantLot(e.user.id, 7);

    const search = async (q: string) =>
      ((await a.agent.get('/admin/users').query({ q }).expect(200)).body.items as { id: string }[]).map((u) => u.id);

    expect(await search('9911')).toEqual([p.user.id]);
    expect(await search('+976 9911-2233')).toEqual([p.user.id]);
    expect(await search('BOLD@')).toEqual([e.user.id]);
    expect(await search('болд')).toEqual([e.user.id]);
    expect(await search(e.user.id)).toEqual([e.user.id]);
    expect(await search('байхгүй-хүн')).toEqual([]);
    // Хоосон: бүгд, шинэ нь эхэнд
    expect(await search('')).toEqual([e.user.id, p.user.id, a.user.id]);

    const row = (await a.agent.get('/admin/users').query({ q: 'bold' }).expect(200)).body.items[0];
    expect(row).toMatchObject({ email: 'bold@example.mn', phone: null, name: 'Болд Батын', creditBalance: 7, blockedAt: null });

    const tch = await teacher();
    const { lessons } = await course(tch.user.id, [3]);
    await buy(e.agent, lessons[0]!.id, 3);
    const d = (await a.agent.get(`/admin/users/${e.user.id}`).expect(200)).body;
    expect(d).toMatchObject({
      id: e.user.id,
      creditBalance: 4,
      credits: { balance: 4 },
      purchases: [{ kind: 'LESSON', courseTitle: 'Англи хэл', lessonTitle: 'Хичээл 1', credits: 3, isTest: false }],
      payments: [],
      subscription: null,
      earnings: null,
    });
    expect(d.ledger.map((l: { type: string; amount: number }) => [l.type, l.amount])).toEqual([
      ['SPEND', -3],
      ['ADMIN_ADJUST', 7],
    ]);
    const td = (await a.agent.get(`/admin/users/${tch.user.id}`).expect(200)).body;
    expect(td.earnings).toMatchObject({ balanceMnt: 1_800, lockedMnt: 0, onHold: false });

    await a.agent.get(`/admin/users/${randomUUID()}`).expect(404);
  });
});

describe('Хаах / нээх', () => {
  it('хаагдсан хэрэглэгчийн session шууд хүчингүй, refresh/OTP нэвтрэлт татгалзана; нээхэд дахин нэвтэрнэ', async () => {
    const a = await admin();
    const u = await loginByEmail(t, 'learner@example.mn');
    await u.agent.get('/me').expect(200);

    await a.agent.post(`/admin/users/${u.user.id}/block`).send({}).expect(400); // шалтгаан заавал
    const blocked = (await a.agent.post(`/admin/users/${u.user.id}/block`).send({ reason: 'Залилан сэжиг' }).expect(200)).body;
    expect(blocked).toMatchObject({ blockedAt: expect.any(String), blockedReason: 'Залилан сэжиг' });

    // Одоо байгаа access token → 401, refresh → хүчингүй
    await u.agent.get('/me').expect(401);
    await u.agent.get('/credits').expect(401);
    expect((await u.agent.post('/auth/refresh').expect(401)).body.code).toBe('REFRESH_INVALID');
    expect(await t.prisma.session.count({ where: { userId: u.user.id, revokedAt: null } })).toBe(0);

    // OTP зөв оруулсан ч нэвтрэхгүй
    const fresh = t.agent();
    const start = await fresh.post('/auth/otp/start').send({ type: 'EMAIL', value: 'learner@example.mn' }).expect(200);
    const denied = await fresh
      .post('/auth/otp/verify')
      .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, 'learner@example.mn') })
      .expect(403);
    expect(denied.body.code).toBe('ACCOUNT_BLOCKED');
    await fresh.get('/me').expect(401);
    expect(await t.prisma.session.count({ where: { userId: u.user.id, revokedAt: null } })).toBe(0);

    // Давтан хаах → idempotent (audit нэг)
    await a.agent.post(`/admin/users/${u.user.id}/block`).send({ reason: 'Залилан сэжиг' }).expect(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'user.block', targetId: u.user.id } })).toBe(1);
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'user.block' } })).actorId).toBe(a.user.id);

    // Админы хайлтад тэмдэглэгдэнэ
    const row = (await a.agent.get('/admin/users').query({ q: 'learner' }).expect(200)).body.items[0];
    expect(row.blockedAt).toEqual(expect.any(String));

    await a.agent.post(`/admin/users/${u.user.id}/unblock`).send({ reason: 'Шалгаад цэвэр' }).expect(200);
    const again = await loginByEmail(t, 'learner@example.mn');
    await again.agent.get('/me').expect(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'user.unblock', targetId: u.user.id } })).toBe(1);
  });

  it('AuthGuard: хүчинтэй token-той байсан ч blockedAt тавигдсан бол 403 ACCOUNT_BLOCKED; нийтийн endpoint-д зочин', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    // tokenVersion нэмэгдээгүй (жишээ нь шууд DB-ээр) — guard өөрөө шалгана.
    await t.prisma.user.update({ where: { id: u.user.id }, data: { blockedAt: new Date(), blockedReason: 'x' } });
    expect((await u.agent.get('/me').expect(403)).body.code).toBe('ACCOUNT_BLOCKED');
    expect((await u.agent.post('/purchases/lessons/' + randomUUID()).send({}).expect(403)).body.code).toBe('ACCOUNT_BLOCKED');
  });

  it('өөрийгөө хаах боломжгүй; байхгүй хэрэглэгч 404', async () => {
    const a = await admin();
    expect((await a.agent.post(`/admin/users/${a.user.id}/block`).send({ reason: 'өөрийгөө' }).expect(409)).body.code).toBe(
      'CANNOT_BLOCK_SELF',
    );
    await a.agent.post(`/admin/users/${randomUUID()}/block`).send({ reason: 'байхгүй' }).expect(404);
    await a.agent.get('/me').expect(200);
  });
});

describe('Кредит гар засвар', () => {
  it('нэмэх/хасах: шалтгаан, ADMIN_ADJUST ledger + allocation (FIFO), audit', async () => {
    const a = await admin();
    const u = await loginByEmail(t, 'learner@example.mn');
    // Эрт дуусах lot (1 сар) — хасалт эхлээд үүнээс
    const early = await grantLot(u.user.id, 5, { validityMonths: 1 });

    const plus = (
      await a.agent.post(`/admin/users/${u.user.id}/credits/adjust`).send({ delta: 3, reason: 'Дэмжлэг #12' }).expect(200)
    ).body;
    expect(plus).toMatchObject({ userId: u.user.id, balance: 8, replayed: false });
    const lot = await t.prisma.creditLot.findFirstOrThrow({ where: { userId: u.user.id, initial: 3 } });
    expect(lot).toMatchObject({ source: 'ADMIN_ADJUST', remaining: 3, isTest: false });

    const minus = (
      await a.agent.post(`/admin/users/${u.user.id}/credits/adjust`).send({ delta: -6, reason: 'Алдаатай нэмэлт' }).expect(200)
    ).body;
    expect(minus.balance).toBe(2);
    const entry = await t.prisma.creditLedgerEntry.findUniqueOrThrow({
      where: { id: minus.entryId },
      include: { allocations: true },
    });
    expect(entry).toMatchObject({
      type: 'ADMIN_ADJUST',
      amount: -6,
      reason: 'Алдаатай нэмэлт',
      actorId: a.user.id,
      refType: 'admin_adjust',
    });
    // FIFO: эрт дуусах lot-оос 5, дараагийнхаас 1
    expect(entry.allocations.map((x) => [x.lotId, x.amount]).sort()).toEqual(
      [
        [early.lotId, -5],
        [lot.id, -1],
      ].sort(),
    );
    // Ledger-ийн нийлбэр = баланс
    const sum = await t.prisma.creditLedgerEntry.aggregate({ where: { userId: u.user.id }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(2);

    const audit = await t.prisma.auditLog.findMany({ where: { action: 'credit.adjust' }, orderBy: { createdAt: 'asc' } });
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({
      actorId: a.user.id,
      targetId: u.user.id,
      before: { balance: 8 },
      after: { balance: 2, delta: -6, reason: 'Алдаатай нэмэлт', entryId: minus.entryId },
    });
  });

  it('үлдэгдлээс их хасахгүй (сөрөг баланс үүсэхгүй), шалтгаангүй бол 400 — юу ч бичигдэхгүй', async () => {
    const a = await admin();
    const u = await loginByEmail(t, 'learner@example.mn');
    await grantLot(u.user.id, 2);
    const path = `/admin/users/${u.user.id}/credits/adjust`;

    expect((await a.agent.post(path).send({ delta: -3, reason: 'Хэт их' }).expect(409)).body.code).toBe('INSUFFICIENT_CREDITS');
    await a.agent.post(path).send({ delta: 1 }).expect(400);
    await a.agent.post(path).send({ delta: 1, reason: 'аа' }).expect(400);
    await a.agent.post(path).send({ delta: 0, reason: 'тэг дүн' }).expect(400);
    await a.agent.post(path).send({ delta: 1.5, reason: 'бутархай' }).expect(400);
    await a.agent.post(`/admin/users/${randomUUID()}/credits/adjust`).send({ delta: 1, reason: 'байхгүй' }).expect(404);

    expect(await balanceOf(u.user.id)).toBe(2);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'ADMIN_ADJUST', actorId: { not: null } } })).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'credit.adjust' } })).toBe(0);
    const lots = await t.prisma.creditLot.findMany();
    expect(lots.every((l) => l.remaining >= 0)).toBe(true);

    // Яг үлдэгдлээрээ хасвал 0
    await a.agent.post(path).send({ delta: -2, reason: 'Бүгдийг хасах' }).expect(200);
    expect(await balanceOf(u.user.id)).toBe(0);
  });

  it('idempotencyKey: давтан илгээлт нэг л бичилт; өөр дүнтэй ижил түлхүүр 409', async () => {
    const a = await admin();
    const u = await loginByEmail(t, 'learner@example.mn');
    const path = `/admin/users/${u.user.id}/credits/adjust`;
    const key = randomUUID();
    const body = { delta: 4, reason: 'Нөхөн олговор', idempotencyKey: key };

    const [r1, r2] = await Promise.all([a.agent.post(path).send(body), a.agent.post(path).send(body)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(r1.body.entryId).toBe(r2.body.entryId);
    expect([r1.body.replayed, r2.body.replayed].sort()).toEqual([false, true]);
    expect(await balanceOf(u.user.id)).toBe(4);
    expect(await t.prisma.creditLedgerEntry.count({ where: { refType: 'admin_adjust', refId: key } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'credit.adjust' } })).toBe(1);

    expect((await a.agent.post(path).send({ ...body, delta: 5 }).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await balanceOf(u.user.id)).toBe(4);
  });
});

describe('Багшийн орлогын гар засвар vs payout', () => {
  const adjust = (a: Agent, teacherId: string, amountMnt: number, extra: object = {}) =>
    a.post(`/admin/users/${teacherId}/earnings/adjust`).send({ amountMnt, reason: 'Гар засвар', ...extra });

  it('ADMIN_ADJUST ledger + audit; нээлттэй хүсэлтийн түгжигдсэн дүнд хүрэх хасалт 409, "төлсөн" зөв хэвээр', async () => {
    const a = await admin();
    const tch = await teacher();

    const r = (await adjust(a.agent, tch.user.id, 80_000).expect(200)).body;
    expect(r).toMatchObject({ balanceMnt: 80_000, lockedMnt: 0, replayed: false });
    const entry = await t.prisma.teacherEarningEntry.findUniqueOrThrow({ where: { id: r.entryId } });
    expect(entry).toMatchObject({ type: 'ADMIN_ADJUST', amountMnt: 80_000, reason: 'Гар засвар', actorId: a.user.id });
    expect(await t.prisma.auditLog.count({ where: { action: 'earnings.adjust', targetId: tch.user.id } })).toBe(1);

    const payout = (await tch.agent.post('/teacher/payouts').expect(201)).body;
    expect(payout.amountMnt).toBe(80_000);

    const denied = await adjust(a.agent, tch.user.id, -1).expect(409);
    expect(denied.body.code).toBe('EARNINGS_BELOW_LOCKED');
    // Нэмэлт орлого → боломжтой үлдэгдлээс хасах нь болно
    await adjust(a.agent, tch.user.id, 10_000).expect(200);
    expect((await adjust(a.agent, tch.user.id, -10_000).expect(200)).body).toMatchObject({ balanceMnt: 80_000, lockedMnt: 80_000 });
    await adjust(a.agent, tch.user.id, -1).expect(409);

    await a.agent.post(`/admin/payouts/${payout.id}/paid`).send({}).expect(200);
    expect((await tch.agent.get('/teacher/payouts').expect(200)).body).toMatchObject({ balanceMnt: 0, lockedMnt: 0 });
    // Нээлттэй хүсэлтгүй: 0-оос доош хасахгүй
    expect((await adjust(a.agent, tch.user.id, -1).expect(409)).body.code).toBe('EARNINGS_BELOW_LOCKED');
    expect(await t.prisma.auditLog.count({ where: { action: 'earnings.adjust' } })).toBe(3);
  });

  it('зэрэг: payout хүсэлт ба хасалт — нэг нь л амжина, түгжигдсэн дүн үлдэгдлээс хэтрэхгүй', async () => {
    const a = await admin();
    const tch = await teacher();
    await adjust(a.agent, tch.user.id, 60_000).expect(200);

    const [req, adj] = await Promise.all([tch.agent.post('/teacher/payouts'), adjust(a.agent, tch.user.id, -20_000)]);
    const ok = [req.status, adj.status].filter((s) => s === 200 || s === 201);
    expect(ok).toHaveLength(1);
    const view = (await tch.agent.get('/teacher/payouts').expect(200)).body;
    expect(view.balanceMnt).toBeGreaterThanOrEqual(view.lockedMnt);
    if (req.status === 201) {
      expect(adj.body.code).toBe('EARNINGS_BELOW_LOCKED');
      await a.agent.post(`/admin/payouts/${req.body.id}/paid`).send({}).expect(200);
    } else {
      expect(req.body.code).toBe('BELOW_MINIMUM');
      expect(view.balanceMnt).toBe(40_000);
    }
  });

  it('шалтгаан заавал, бүхэл ₮, idempotencyKey давтвал нэг бичилт', async () => {
    const a = await admin();
    const tch = await teacher();
    await a.agent.post(`/admin/users/${tch.user.id}/earnings/adjust`).send({ amountMnt: 100 }).expect(400);
    await adjust(a.agent, tch.user.id, 10.5).expect(400);
    await adjust(a.agent, tch.user.id, 0).expect(400);

    const key = randomUUID();
    const first = (await adjust(a.agent, tch.user.id, 5_000, { idempotencyKey: key }).expect(200)).body;
    const second = (await adjust(a.agent, tch.user.id, 5_000, { idempotencyKey: key }).expect(200)).body;
    expect(second).toMatchObject({ entryId: first.entryId, balanceMnt: 5_000, replayed: true });
    expect((await adjust(a.agent, tch.user.id, -5_000, { idempotencyKey: key }).expect(409)).body.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(await t.prisma.teacherEarningEntry.count()).toBe(1);
  });
});

describe('Төлбөрийн тохирол', () => {
  it('хуучирсан PENDING жагсаалтад; "дахин шалгах" төлөгдсөн бол ердийн урсгалаар нэг удаа олгоно', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent, {});
    const u = await loginByEmail(t, 'learner@example.mn');
    const { id, invoiceId } = await startTopup(u.agent, pkg.id);
    const fresh = await startTopup(u.agent, pkg.id); // шинэ — жагсаалтад орохгүй
    await t.prisma.payment.update({ where: { id }, data: { createdAt: new Date(Date.now() - 2 * 60 * MIN) } });

    const issues = (await a.agent.get('/admin/payments/issues').expect(200)).body;
    expect(issues.counts).toEqual({ STALE_PENDING: 1, CARD_UNSETTLED: 0, AMOUNT_MISMATCH: 0, CANCELED_PAID: 0 });
    expect(issues.items).toEqual([
      expect.objectContaining({ id, kind: 'STALE_PENDING', status: 'PENDING', user: expect.objectContaining({ email: 'learner@example.mn' }) }),
    ]);
    expect(issues.items.map((i: { id: string }) => i.id)).not.toContain(fresh.id);

    // Төлөгдөөгүй → GRANT боломжгүй
    expect(
      (await a.agent.post(`/admin/payments/${id}/resolve`).send({ action: 'GRANT', note: 'Банкнаас харсан' }).expect(409)).body.code,
    ).toBe('PAYMENT_NOT_RESOLVABLE');

    t.qpay.markPaid(invoiceId);
    const r = (await a.agent.post(`/admin/payments/${id}/recheck`).expect(200)).body;
    expect(r).toMatchObject({ status: 'PAID', paidAmountMnt: 10_000 });
    await a.agent.post(`/admin/payments/${id}/recheck`).expect(200);
    expect(await balanceOf(u.user.id)).toBe(10);
    expect(await t.prisma.creditLot.count({ where: { paymentId: id } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'payment.recheck', targetId: id } })).toBe(2);
    expect((await a.agent.get('/admin/payments/issues').expect(200)).body.counts.STALE_PENDING).toBe(0);
  });

  it('хуучирсан PENDING-ийг "хаах": QPay дээр цуцлаад CANCELED; дараа нь төлөгдвөл тохирлоор илэрч дахин нээгдэнэ', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent, {});
    const u = await loginByEmail(t, 'learner@example.mn');
    const { id, invoiceId } = await startTopup(u.agent, pkg.id);

    await a.agent.post(`/admin/payments/${id}/resolve`).send({ action: 'CLOSE' }).expect(400); // тэмдэглэл заавал
    const closed = (
      await a.agent.post(`/admin/payments/${id}/resolve`).send({ action: 'CLOSE', note: 'Хэрэглэгч төлөхгүй гэсэн' }).expect(200)
    ).body;
    expect(closed).toMatchObject({ status: 'CANCELED', resolution: 'CLOSED', resolutionNote: 'Хэрэглэгч төлөхгүй гэсэн' });
    expect(t.qpay.invoices.find((i) => i.invoiceId === invoiceId)!.canceled).toBe(true);

    // Хэрэглэгч цуцалсан нэхэмжлэхийг төлсөн → тохирол илрүүлнэ
    t.qpay.markPaid(invoiceId);
    const rec = (await a.agent.post('/admin/payments/reconcile-canceled').expect(200)).body;
    expect(rec).toEqual({ checked: 1, found: 1, failed: 0 });
    const issues = (await a.agent.get('/admin/payments/issues').expect(200)).body;
    expect(issues.items).toEqual([expect.objectContaining({ id, kind: 'CANCELED_PAID', paidAmountMnt: 10_000, resolution: null })]);
    expect(await t.prisma.auditLog.count({ where: { action: 'payment.canceled_paid', targetId: id } })).toBe(1);
    expect(await balanceOf(u.user.id)).toBe(0);

    const granted = (
      await a.agent.post(`/admin/payments/${id}/resolve`).send({ action: 'GRANT', note: 'Цуцалсны дараа төлсөн' }).expect(200)
    ).body;
    expect(granted).toMatchObject({ status: 'PAID', resolution: 'GRANTED' });
    expect(await balanceOf(u.user.id)).toBe(10);
    const lot = await t.prisma.creditLot.findUniqueOrThrow({ where: { paymentId: id } });
    expect(lot).toMatchObject({ source: 'TOPUP', initial: 10, isTest: false });
    // Дахин тохирол → шинэ илрэлтгүй
    expect((await a.agent.post('/admin/payments/reconcile-canceled').expect(200)).body).toEqual({ checked: 0, found: 0, failed: 0 });
  });

  it('AMOUNT_MISMATCH → "олгох" нэг удаа (давтвал idempotent, эсрэг шийдвэр 409); тест багц is_test хэвээр', async () => {
    const a = await admin();
    const testPkg = await createPackage(a.agent, { name: 'Туршилт', credits: 1, priceMnt: 100, isTest: true });
    const { id, invoiceId } = await startTopup(a.agent, testPkg.id);
    t.qpay.markPaid(invoiceId, 50);
    expect((await a.agent.post(`/credits/topups/${id}/check`).expect(200)).body.status).toBe('AMOUNT_MISMATCH');

    const issues = (await a.agent.get('/admin/payments/issues').expect(200)).body;
    expect(issues.items).toEqual([expect.objectContaining({ id, kind: 'AMOUNT_MISMATCH', paidAmountMnt: 50, isTest: true })]);

    const body = { action: 'GRANT', note: 'Дутуу төлсөн ч олгов' };
    const [g1, g2] = await Promise.all([
      a.agent.post(`/admin/payments/${id}/resolve`).send(body),
      a.agent.post(`/admin/payments/${id}/resolve`).send(body),
    ]);
    // Зэрэг: нэг нь олгоно, нөгөө нь idempotent 200 эсвэл төлөв өөрчлөгдсөн 409 — давхар олголтгүй.
    expect([g1.status, g2.status]).toContain(200);
    for (const g of [g1, g2]) if (g.status !== 200) expect(g.body.code).toBe('PAYMENT_STATE_CHANGED');
    await a.agent.post(`/admin/payments/${id}/resolve`).send(body).expect(200);
    expect(await t.prisma.creditLot.count({ where: { paymentId: id } })).toBe(1);
    expect(await balanceOf(a.user.id)).toBe(1);
    const entry = await t.prisma.creditLedgerEntry.findFirstOrThrow({ where: { paymentId: id } });
    expect(entry).toMatchObject({ type: 'TOPUP', amount: 1, isTest: true, actorId: a.user.id, reason: body.note });

    expect(
      (await a.agent.post(`/admin/payments/${id}/resolve`).send({ action: 'CLOSE', note: 'Буцаасан' }).expect(409)).body.code,
    ).toBe('PAYMENT_NOT_RESOLVABLE');
    expect(await t.prisma.auditLog.count({ where: { action: 'payment.resolve', targetId: id } })).toBe(1);
    expect((await a.agent.get('/admin/payments/issues').expect(200)).body.items).toEqual([]);
  });

  it('картаас татагдсан ч олголт унасан subscription төлбөр → "олгох": үе + кредит + ACTIVE, нэг transaction-д', async () => {
    const a = await admin();
    const plan = (
      await a.agent.post('/admin/subscription-plans').send({ name: 'Сарын 20', priceMnt: 15_000, credits: 20 }).expect(201)
    ).body;
    const u = await loginByEmail(t, 'learner@example.mn');
    const end = new Date(Date.now() - 60 * MIN);
    const sub = await t.prisma.subscription.create({
      data: {
        userId: u.user.id,
        planId: plan.id,
        status: 'PAST_DUE',
        currentPeriodStart: new Date(end.getTime() - 30 * DAY),
        currentPeriodEnd: end,
        pastDueSince: end,
      },
    });
    const payment = await t.prisma.payment.create({
      data: {
        userId: u.user.id,
        purpose: 'SUBSCRIPTION',
        subscriptionId: sub.id,
        planId: plan.id,
        renewalFor: end,
        method: 'CARD',
        amountMnt: 15_000,
        credits: 20,
        creditPriceMnt: 1_000,
        callbackToken: randomBytes(32).toString('base64url'),
        providerPaymentId: 'fake-card-payment-1',
        createdAt: new Date(Date.now() - 30 * MIN),
      },
    });

    const issues = (await a.agent.get('/admin/payments/issues').expect(200)).body;
    expect(issues.items).toEqual([expect.objectContaining({ id: payment.id, kind: 'CARD_UNSETTLED', method: 'CARD' })]);

    const r = (
      await a.agent.post(`/admin/payments/${payment.id}/resolve`).send({ action: 'GRANT', note: 'Картаас татагдсан нь батлагдсан' }).expect(200)
    ).body;
    expect(r).toMatchObject({ status: 'PAID', resolution: 'GRANTED' });
    expect(await t.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).toMatchObject({
      status: 'ACTIVE',
      currentPeriodStart: end,
      pastDueSince: null,
    });
    expect(await t.prisma.subscriptionPeriod.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(await balanceOf(u.user.id)).toBe(20);
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { paymentId: payment.id } })).toMatchObject({
      source: 'SUBSCRIPTION_GRANT',
    });
    expect(await t.prisma.auditLog.count({ where: { action: 'payment.resolve', targetId: payment.id, actorId: a.user.id } })).toBe(1);
    await a.agent.post(`/admin/payments/${payment.id}/resolve`).send({ action: 'GRANT', note: 'дахин дарсан' }).expect(200);
    expect(await balanceOf(u.user.id)).toBe(20);
  });
});

describe('Тайлан', () => {
  it('орлого, кредит, борлуулалт, шилдэг курс/багш — is_test гүйлгээ тусдаа, үндсэн тоонд орохгүй', async () => {
    const a = await admin();
    const live = await createPackage(a.agent, { credits: 10, priceMnt: 10_000 });
    const testPkg = await createPackage(a.agent, { name: 'Туршилт', credits: 1, priceMnt: 100, isTest: true });
    const tch = await teacher();
    const { course: c, lessons } = await course(tch.user.id, [5, 1]);
    const u = await loginByEmail(t, 'learner@example.mn');

    await paidTopup(u.agent, live.id);
    await paidTopup(a.agent, testPkg.id);
    await buy(u.agent, lessons[0]!.id, 5); // жинхэнэ
    await buy(a.agent, lessons[1]!.id, 1); // тест lot-оос → is_test
    await a.agent.post(`/admin/users/${u.user.id}/credits/adjust`).send({ delta: 2, reason: 'Урамшуулал' }).expect(200);
    await a.agent.post(`/admin/users/${u.user.id}/credits/adjust`).send({ delta: -1, reason: 'Засвар' }).expect(200);

    const s = (await a.agent.get('/admin/reports/summary').expect(200)).body;
    expect(s.live).toEqual({
      revenue: { totalMnt: 10_000, topupMnt: 10_000, subscriptionMnt: 0, payments: 1 },
      credits: { topup: 10, subscriptionGrant: 0, spent: 5, expired: 0, adminAdded: 2, adminRemoved: 1 },
      // 5 кр × 1000₮ = 5000; багшид 60% = 3000
      sales: { purchases: 1, credits: 5, grossMnt: 5_000, teacherEarningsMnt: 3_000, platformMnt: 2_000 },
    });
    expect(s.test).toEqual({
      revenue: { totalMnt: 100, topupMnt: 100, subscriptionMnt: 0, payments: 1 },
      credits: { topup: 1, subscriptionGrant: 0, spent: 1, expired: 0, adminAdded: 0, adminRemoved: 0 },
      sales: { purchases: 1, credits: 1, grossMnt: 1_000, teacherEarningsMnt: 600, platformMnt: 400 },
    });
    expect(s.topCourses).toEqual([
      { courseId: c.id, title: 'Англи хэл', teacher: { id: tch.user.id, name: null }, purchases: 1, credits: 5, grossMnt: 5_000 },
    ]);
    expect(s.topTeachers).toEqual([{ teacher: { id: tch.user.id, name: null }, sales: 1, grossMnt: 5_000, earningsMnt: 3_000 }]);
    expect(s.payoutsPaidMnt).toBe(0);

    // Мужаас гадуур → хоосон
    const old = (await a.agent.get('/admin/reports/summary').query({ from: '2020-01-01', to: '2020-01-31' }).expect(200)).body;
    expect(old.live.revenue.totalMnt).toBe(0);
    expect(old.topCourses).toEqual([]);
    await a.agent.get('/admin/reports/summary').query({ from: '2026-02-01', to: '2026-01-01' }).expect(400);
    await a.agent.get('/admin/reports/summary').query({ from: 'өчигдөр' }).expect(400);
  });

  it('дууссан кредитийн тайлан: тоо хэмжээ, тест lot тусдаа, ойрын 30 хоногт дуусах', async () => {
    const a = await admin();
    const u = await loginByEmail(t, 'learner@example.mn');
    const past = new Date(Date.now() - 2 * DAY);
    await grantLot(u.user.id, 7, { validityMonths: 0, now: past });
    await grantLot(u.user.id, 3, { validityMonths: 0, now: past, isTest: true });
    const soon = await grantLot(u.user.id, 4);
    await t.prisma.creditLot.update({ where: { id: soon.lotId }, data: { expiresAt: new Date(Date.now() + 10 * DAY) } });
    await credits.expireDue();

    const r = (await a.agent.get('/admin/reports/expired-credits').expect(200)).body;
    expect(r.live).toEqual({ credits: 7, lots: 1 });
    expect(r.test).toEqual({ credits: 3, lots: 1 });
    expect(r.upcoming30d).toEqual({ live: 4, test: 0 });
    expect(r.items).toHaveLength(2);
    expect(r.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expiredCredits: 7, isTest: false, initial: 7, user: expect.objectContaining({ email: 'learner@example.mn' }) }),
        expect.objectContaining({ expiredCredits: 3, isTest: true }),
      ]),
    );
  });
});

describe('Тойм', () => {
  it('хүлээгдэж буй ажлын тоо: хуучирсан төлбөр, нээлттэй payout; шинэ төлбөр, шийдсэн payout тоологдохгүй', async () => {
    const a = await admin();
    const empty = { teacherApplications: 0, courseReviews: 0, payouts: 0, paymentIssues: 0 };
    expect((await a.agent.get('/admin/overview').expect(200)).body).toEqual({ pending: empty });

    const pkg = await createPackage(a.agent, {});
    const u = await loginByEmail(t, 'learner@example.mn');
    const stale = await startTopup(u.agent, pkg.id);
    await startTopup(u.agent, pkg.id); // шинэ — асуудал биш
    await t.prisma.payment.update({ where: { id: stale.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * MIN) } });

    const tch = await teacher();
    const other = await teacher('teacher2@example.mn');
    const payout = { amountMnt: 5_000, bank: BANK.bank, accountNumber: BANK.accountNumber, holderName: BANK.holderName };
    await t.prisma.payout.create({ data: { ...payout, teacherId: tch.user.id } });
    await t.prisma.payout.create({ data: { ...payout, teacherId: other.user.id, status: 'REJECTED', processedAt: new Date(), rejectReason: 'шалгалт' } });

    expect((await a.agent.get('/admin/overview').expect(200)).body).toEqual({
      pending: { ...empty, payouts: 1, paymentIssues: 1 },
    });
  });
});
