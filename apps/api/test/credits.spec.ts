import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт) + зэрэг transaction-ууд.
jest.setTimeout(180_000);

let t: TestApp;
let credits: CreditsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

async function createPackage(a: Agent, body: Record<string, unknown> = {}) {
  return (
    await a
      .post('/admin/credit-packages')
      .send({ name: '10 кредит', credits: 10, priceMnt: 10_000, ...body })
      .expect(201)
  ).body as { id: string; isTest: boolean };
}

/** Хэрэглэгч багц сонгож нэхэмжлэх авна → { topup, invoiceId, callbackPath } */
async function startTopup(agent: Agent, packageId: string) {
  const topup = (await agent.post('/credits/topups').send({ packageId }).expect(201)).body;
  const inv = t.qpay.last()!;
  const callbackPath = new URL(inv.input.callbackUrl).pathname.replace(/^\/api/, '');
  return { topup, invoiceId: inv.invoiceId, callbackPath };
}

async function balanceOf(agent: Agent): Promise<number> {
  return (await agent.get('/credits').expect(200)).body.balance;
}

describe('QPay цэнэглэлт', () => {
  it('хэрэглэгч "Төлбөр шалгах": төлөөгүй → PENDING, төлсний дараа → PAID, кредит + lot + түүх + баримт', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const u = await loginByEmail(t, 'learner@example.mn');

    const { topup, invoiceId, callbackPath } = await startTopup(u.agent, pkg.id);
    expect(topup).toMatchObject({ status: 'PENDING', credits: 10, amountMnt: 10_000, isTest: false });
    expect(topup.qrImage).toEqual(expect.any(String));
    expect(topup.qrText).toEqual(expect.any(String));
    expect(topup.deeplinks.length).toBeGreaterThan(0);
    // Callback URL нь таамаглашгүй токентой
    expect(callbackPath).toMatch(/^\/payments\/qpay\/callback\/[\w-]{40,}$/);
    expect(t.qpay.last()!.input.amountMnt).toBe(10_000);

    await u.agent.post(`/credits/topups/${topup.id}/check`).expect(200).expect((r) => expect(r.body.status).toBe('PENDING'));
    expect(await balanceOf(u.agent)).toBe(0);

    t.qpay.markPaid(invoiceId);
    const paid = (await u.agent.post(`/credits/topups/${topup.id}/check`).expect(200)).body;
    expect(paid.status).toBe('PAID');
    expect(paid.qrImage).toBeNull();

    const view = (await u.agent.get('/credits').expect(200)).body;
    expect(view.balance).toBe(10);
    expect(view.lots).toHaveLength(1);
    const months =
      (new Date(view.lots[0].expiresAt).getUTCFullYear() - new Date().getUTCFullYear()) * 12 +
      new Date(view.lots[0].expiresAt).getUTCMonth() -
      new Date().getUTCMonth();
    expect(months).toBe(12);

    const history = (await u.agent.get('/credits/history').expect(200)).body;
    expect(history.items).toEqual([expect.objectContaining({ type: 'TOPUP', amount: 10, paymentId: topup.id, isTest: false })]);

    const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: topup.id } });
    expect(payment).toMatchObject({ creditPriceMnt: 1000, paidAmountMnt: 10_000 });

    const notes = await t.prisma.notification.findMany({ where: { userId: u.user.id, type: 'CREDIT_TOPUP_PAID' } });
    expect(notes).toHaveLength(1);
    await t.queue.drain();
    expect(t.email.last('learner@example.mn')?.subject).toContain('10 кредит');

    // Дахин шалгавал QPay руу дуудахгүй, давхар олгохгүй
    const checks = t.qpay.checks;
    await u.agent.post(`/credits/topups/${topup.id}/check`).expect(200);
    expect(t.qpay.checks).toBe(checks);
    expect(await balanceOf(u.agent)).toBe(10);
  });

  it('давхар callback → нэг л удаа кредит олгоно', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const u = await loginByEmail(t, 'learner@example.mn');
    const { topup, invoiceId, callbackPath } = await startTopup(u.agent, pkg.id);
    t.qpay.markPaid(invoiceId);

    await t.http().post(callbackPath).send({ payment_id: 'x' }).expect(200).expect((r) => expect(r.body.status).toBe('PAID'));
    await t.http().get(callbackPath).expect(200);
    await t.http().post(callbackPath).expect(200);
    await u.agent.post(`/credits/topups/${topup.id}/check`).expect(200);

    expect(await balanceOf(u.agent)).toBe(10);
    expect(await t.prisma.creditLot.count()).toBe(1);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'TOPUP' } })).toBe(1);
    expect(await t.prisma.notification.count({ where: { type: 'CREDIT_TOPUP_PAID' } })).toBe(1);
  });

  it('зэрэг ирсэн callback-ууд → нэг л удаа', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const u = await loginByEmail(t, 'learner@example.mn');
    const { topup, invoiceId, callbackPath } = await startTopup(u.agent, pkg.id);
    t.qpay.markPaid(invoiceId);

    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => t.http().post(callbackPath)),
      u.agent.post(`/credits/topups/${topup.id}/check`),
    ]);
    for (const r of results) expect(r.status).toBe(200);

    expect(await balanceOf(u.agent)).toBe(10);
    expect(await t.prisma.creditLot.count()).toBe(1);
    expect(await t.prisma.creditLedgerEntry.count()).toBe(1);
    expect(await t.prisma.notification.count({ where: { type: 'CREDIT_TOPUP_PAID' } })).toBe(1);
  });

  it('хуурамч callback: QPay шалгалтаар төлөгдөөгүй бол юу ч олгохгүй; мэдэгдэхгүй токен 404', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const u = await loginByEmail(t, 'learner@example.mn');
    const { topup, callbackPath } = await startTopup(u.agent, pkg.id);

    // Body-д "PAID" гэж бичсэн ч итгэхгүй
    await t
      .http()
      .post(callbackPath)
      .send({ payment_status: 'PAID', paid_amount: 10_000 })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('PENDING'));
    await t.http().post('/payments/qpay/callback/not-a-real-token-0000000000000000').expect(404);
    await t.http().post('/payments/qpay/callback/x').expect(404);

    expect(await balanceOf(u.agent)).toBe(0);
    expect(await t.prisma.creditLedgerEntry.count()).toBe(0);
    expect((await t.prisma.payment.findUniqueOrThrow({ where: { id: topup.id } })).status).toBe('PENDING');
  });

  it('төлсөн дүн таарахгүй → AMOUNT_MISMATCH, кредит олгохгүй, audit', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const u = await loginByEmail(t, 'learner@example.mn');
    const { topup, invoiceId, callbackPath } = await startTopup(u.agent, pkg.id);
    t.qpay.markPaid(invoiceId, 100);

    await t.http().post(callbackPath).expect(200).expect((r) => expect(r.body.status).toBe('AMOUNT_MISMATCH'));
    await u.agent.post(`/credits/topups/${topup.id}/check`).expect(200).expect((r) => expect(r.body.status).toBe('AMOUNT_MISMATCH'));

    expect(await balanceOf(u.agent)).toBe(0);
    expect(await t.prisma.creditLot.count()).toBe(0);
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'payment.amount_mismatch' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetId: topup.id, actorId: null });
  });

  it('QPay нэхэмжлэх үүсгэж чадахгүй бол 502, төлбөр FAILED; QPay шалгалт унавал 502', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const u = await loginByEmail(t, 'learner@example.mn');

    t.qpay.failNext('create');
    const res = await u.agent.post('/credits/topups').send({ packageId: pkg.id }).expect(502);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(await t.prisma.payment.findMany()).toEqual([expect.objectContaining({ status: 'FAILED' })]);

    const { topup } = await startTopup(u.agent, pkg.id);
    t.qpay.failNext('check');
    await u.agent.post(`/credits/topups/${topup.id}/check`).expect(502);
  });

  it('бусдын төлбөрийг харах, шалгах боломжгүй', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    const owner = await loginByEmail(t, 'owner@example.mn');
    const other = await loginByEmail(t, 'other@example.mn');
    const { topup } = await startTopup(owner.agent, pkg.id);
    await other.agent.get(`/credits/topups/${topup.id}`).expect(404);
    await other.agent.post(`/credits/topups/${topup.id}/check`).expect(404);
    await t.http().get('/credits').expect(401);
  });
});

describe('Тест багц ба багц удирдлага', () => {
  it('100₮ тест багц зөвхөн админд; гүйлгээ, lot, ledger нь isTest', async () => {
    const a = await admin();
    const normal = await createPackage(a.agent);
    const test = await createPackage(a.agent, { name: 'Туршилт', credits: 1, priceMnt: 100, isTest: true });
    await createPackage(a.agent, { name: 'Идэвхгүй', active: false });

    const u = await loginByEmail(t, 'learner@example.mn');
    const userList = (await u.agent.get('/credits/packages').expect(200)).body;
    expect(userList.map((p: { id: string }) => p.id)).toEqual([normal.id]);
    await u.agent.post('/credits/topups').send({ packageId: test.id }).expect(404);

    const adminList = (await a.agent.get('/credits/packages').expect(200)).body;
    expect(adminList.map((p: { id: string }) => p.id).sort()).toEqual([normal.id, test.id].sort());

    const { topup, invoiceId, callbackPath } = await startTopup(a.agent, test.id);
    expect(topup).toMatchObject({ isTest: true, amountMnt: 100 });
    t.qpay.markPaid(invoiceId);
    await t.http().post(callbackPath).expect(200);

    expect(await t.prisma.payment.findUniqueOrThrow({ where: { id: topup.id } })).toMatchObject({ status: 'PAID', isTest: true });
    expect(await t.prisma.creditLot.findFirstOrThrow()).toMatchObject({ isTest: true, initial: 1 });
    const history = (await a.agent.get('/credits/history').expect(200)).body;
    expect(history.items).toEqual([expect.objectContaining({ type: 'TOPUP', amount: 1, isTest: true })]);

    // Тест кредитээр зарцуулбал SPEND нь мөн isTest
    const spent = await t.prisma.$transaction((tx) => credits.spend(tx, { userId: a.user.id, credits: 1 }), CREDIT_TX_OPTIONS);
    expect(spent.isTest).toBe(true);
  });

  it('админ бус хэрэглэгч багц удирдах, кредит засах боломжгүй', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    await u.agent.get('/admin/credit-packages').expect(403);
    await u.agent.post('/admin/credit-packages').send({ name: 'x', credits: 1, priceMnt: 1 }).expect(403);
    await u.agent.post('/admin/credits/adjust').send({ user: u.user.id, delta: 100, reason: 'өөртөө' }).expect(403);
    await t.http().get('/admin/credit-packages').expect(401);
    expect(await balanceOf(u.agent)).toBe(0);
  });

  it('багц CRUD audit-тэй; төлбөртэй багцыг устгахгүй', async () => {
    const a = await admin();
    const pkg = await createPackage(a.agent);
    await a.agent.patch(`/admin/credit-packages/${pkg.id}`).send({ priceMnt: 9_000, active: false }).expect(200);
    await a.agent.post('/admin/credit-packages').send({ name: 'x', credits: 0, priceMnt: 1 }).expect(400);

    const other = await createPackage(a.agent, { name: 'Ашиглагдсан' });
    await startTopup(a.agent, other.id);
    const del = await a.agent.delete(`/admin/credit-packages/${other.id}`).expect(409);
    expect(del.body.code).toBe('PACKAGE_IN_USE');
    await a.agent.delete(`/admin/credit-packages/${pkg.id}`).expect(204);

    const actions = (await t.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => r.action);
    expect(actions.filter((x) => x.startsWith('credit_package.'))).toEqual([
      'credit_package.create',
      'credit_package.update',
      'credit_package.create',
      'credit_package.delete',
    ]);
    const update = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'credit_package.update' } });
    expect(update.before).toMatchObject({ priceMnt: 10_000, active: true });
    expect(update.after).toMatchObject({ priceMnt: 9_000, active: false });
  });
});

describe('Ledger: FIFO, хүрэлцэхгүй, зэрэг зарцуулалт, засвар, дуусгавар', () => {
  async function grant(userId: string, amount: number, validityMonths: number) {
    return t.prisma.$transaction(
      (tx) => credits.grant(tx, { userId, credits: amount, source: 'ADMIN_ADJUST', validityMonths }),
      CREDIT_TX_OPTIONS,
    );
  }

  it('хамгийн эрт дуусах lot-оос эхэлж хасна (FIFO), олон lot хамарна', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    const late = await grant(u.user.id, 5, 12);
    const early = await grant(u.user.id, 3, 1);

    const res = await t.prisma.$transaction(
      (tx) => credits.spend(tx, { userId: u.user.id, credits: 4, refType: 'lesson', refId: 'L1' }),
      CREDIT_TX_OPTIONS,
    );
    expect(res.allocations).toEqual([
      { lotId: early.lotId, credits: 3, isTest: false },
      { lotId: late.lotId, credits: 1, isTest: false },
    ]);
    const view = (await u.agent.get('/credits').expect(200)).body;
    expect(view.balance).toBe(4);
    expect(view.lots).toEqual([expect.objectContaining({ id: late.lotId, remaining: 4, initial: 5 })]);

    const history = (await u.agent.get('/credits/history?limit=1').expect(200)).body;
    expect(history.items).toEqual([expect.objectContaining({ type: 'SPEND', amount: -4, refType: 'lesson', refId: 'L1' })]);
    expect(history.nextCursor).toEqual(expect.any(String));
    const page2 = (await u.agent.get(`/credits/history?limit=10&before=${history.nextCursor}`).expect(200)).body;
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
  });

  it('хүрэлцэхгүй бол INSUFFICIENT_CREDITS, transaction бүхэлдээ rollback', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    await grant(u.user.id, 2, 12);
    await expect(
      t.prisma.$transaction(async (tx) => {
        // Дуудагчийн бичилт (жишээ нь entitlement) мөн буцаагдана
        await tx.auditLog.create({ data: { action: 'probe', targetType: 'x', targetId: 'y' } });
        return credits.spend(tx, { userId: u.user.id, credits: 3 });
      }, CREDIT_TX_OPTIONS),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_CREDITS' } });
    expect(await balanceOf(u.agent)).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'probe' } })).toBe(0);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'SPEND' } })).toBe(0);
  });

  it('зэрэг зарцуулалт хэзээ ч сөрөг баланс, давхар зарцуулалт үүсгэхгүй', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    await grant(u.user.id, 4, 12);
    await grant(u.user.id, 6, 3);

    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        t.prisma.$transaction(
          (tx) => credits.spend(tx, { userId: u.user.id, credits: 3, refType: 'test', refId: String(i) }),
          CREDIT_TX_OPTIONS,
        ),
      ),
    );
    const ok = attempts.filter((r) => r.status === 'fulfilled');
    const failed = attempts.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(3);
    for (const f of failed) expect(f.reason).toMatchObject({ response: { code: 'INSUFFICIENT_CREDITS' } });

    expect(await balanceOf(u.agent)).toBe(1);
    const lots = await t.prisma.creditLot.findMany();
    expect(lots.every((l) => l.remaining >= 0)).toBe(true);
    const spent = await t.prisma.creditLedgerEntry.aggregate({ where: { type: 'SPEND' }, _sum: { amount: true } });
    expect(spent._sum.amount).toBe(-9);
  });

  it('админ гараар нэмэх/хасах: шалтгаан, ADMIN_ADJUST, audit; үлдэгдлээс их хасахгүй', async () => {
    const a = await admin();
    const u = await loginByEmail(t, 'learner@example.mn');

    const plus = (await a.agent.post('/admin/credits/adjust').send({ user: 'learner@example.mn', delta: 5, reason: 'Дэмжлэг #12' }).expect(200)).body;
    expect(plus).toEqual({ userId: u.user.id, balance: 5 });
    const minus = (await a.agent.post('/admin/credits/adjust').send({ user: u.user.id, delta: -2, reason: 'Алдаатай нэмэлт' }).expect(200)).body;
    expect(minus.balance).toBe(3);
    const tooMuch = await a.agent.post('/admin/credits/adjust').send({ user: u.user.id, delta: -10, reason: 'Хэт их' }).expect(409);
    expect(tooMuch.body.code).toBe('INSUFFICIENT_CREDITS');
    await a.agent.post('/admin/credits/adjust').send({ user: 'nobody@example.mn', delta: 1, reason: 'Байхгүй' }).expect(404);
    await a.agent.post('/admin/credits/adjust').send({ user: u.user.id, delta: 1 }).expect(400);

    const history = (await u.agent.get('/credits/history').expect(200)).body.items;
    expect(history).toEqual([
      expect.objectContaining({ type: 'ADMIN_ADJUST', amount: -2, reason: 'Алдаатай нэмэлт' }),
      expect.objectContaining({ type: 'ADMIN_ADJUST', amount: 5, reason: 'Дэмжлэг #12' }),
    ]);
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'credit.adjust' }, orderBy: { createdAt: 'asc' } });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actorId: a.user.id, targetId: u.user.id, before: { balance: 0 } });
    expect(audit[1]!.after).toMatchObject({ balance: 3, delta: -2, reason: 'Алдаатай нэмэлт' });
  });

  it('хугацаа дууссан lot-ыг EXPIRE-ээр хасна, давхар ажиллахад idempotent; дууссан кредитээр зарцуулахгүй', async () => {
    const u = await loginByEmail(t, 'learner@example.mn');
    const old = await t.prisma.$transaction(
      (tx) =>
        credits.grant(tx, {
          userId: u.user.id,
          credits: 7,
          source: 'TOPUP',
          validityMonths: 1,
          now: new Date(Date.now() - 40 * 24 * 3600_000),
        }),
      CREDIT_TX_OPTIONS,
    );
    await grant(u.user.id, 2, 12);
    expect(await balanceOf(u.agent)).toBe(2);
    await expect(
      t.prisma.$transaction((tx) => credits.spend(tx, { userId: u.user.id, credits: 3 }), CREDIT_TX_OPTIONS),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_CREDITS' } });

    expect(await credits.expireDue()).toBe(1);
    expect(await credits.expireDue()).toBe(0);
    const entries = await t.prisma.creditLedgerEntry.findMany({ where: { type: 'EXPIRE' } });
    expect(entries).toEqual([expect.objectContaining({ amount: -7 })]);
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: old.lotId } })).toMatchObject({ remaining: 0 });
    // Ledger нийлбэр = баланс
    const sum = await t.prisma.creditLedgerEntry.aggregate({ where: { userId: u.user.id }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(2);
  });
});
