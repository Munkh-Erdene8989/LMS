import { grantRoleByIdentifier } from '../src/admin/roles';
import { SUBSCRIPTION_RENEW_JOB, SubscriptionsService } from '../src/subscriptions/subscriptions.service';
import { TRANSITIONS } from '../src/subscriptions/state';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт) + зэрэг transaction-ууд.
jest.setTimeout(180_000);

let t: TestApp;
let service: SubscriptionsService;

beforeAll(async () => {
  t = await createTestApp();
  service = t.app.get(SubscriptionsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];
const DAY = 24 * 60 * 60_000;

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

async function createPlan(a: Agent, body: Record<string, unknown> = {}) {
  return (
    await a
      .post('/admin/subscription-plans')
      .send({ name: 'Сарын 20', priceMnt: 15_000, credits: 20, ...body })
      .expect(201)
  ).body as { id: string; name: string };
}

/** Админ багц үүсгэж, суралцагч нэвтэрнэ. */
async function setup() {
  const a = await admin();
  const plan = await createPlan(a.agent);
  const u = await loginByEmail(t, 'learner@example.mn');
  return { a, plan, u };
}

function callbackPathOf(invoiceId: string): string {
  const inv = t.qpay.invoices.find((i) => i.invoiceId === invoiceId)!;
  return new URL(inv.input.callbackUrl).pathname.replace(/^\/api/, '');
}

async function overview(agent: Agent) {
  return (await agent.get('/subscription').expect(200)).body;
}

async function balanceOf(agent: Agent): Promise<number> {
  return (await agent.get('/credits').expect(200)).body.balance;
}

async function subRow(userId: string) {
  return t.prisma.subscription.findUniqueOrThrow({ where: { userId } });
}

/** Нэхэмжлэхээр эхлүүлж төлнө → ACTIVE */
async function subscribeByInvoice(agent: Agent, planId: string) {
  await agent.post('/subscription').send({ planId }).expect(201);
  const inv = t.qpay.last()!;
  t.qpay.markPaid(inv.invoiceId);
  await t.http().post(callbackPathOf(inv.invoiceId)).expect(200);
}

async function linkCard(agent: Agent) {
  const { redirectUrl } = (await agent.post('/subscription/card').expect(200)).body;
  expect(redirectUrl).toEqual(expect.any(String));
  const reg = t.qpay.cards[t.qpay.cards.length - 1]!;
  t.qpay.completeCard(reg.registrationId);
  const ov = (await agent.post('/subscription/card/check').expect(200)).body;
  expect(ov.card).toEqual({ status: 'ACTIVE', maskedPan: '•••• 1111', brand: 'VISA' });
  // Токен API-д хэзээ ч буцахгүй
  expect(JSON.stringify(ov)).not.toContain('fake-card-token');
}

/** Одоогийн үеийг дууссан болгоно (цаг гүйлгэхийн оронд). */
async function endCurrentPeriod(userId: string) {
  const end = new Date(Date.now() - 60_000);
  await t.prisma.subscription.update({
    where: { userId },
    data: { currentPeriodEnd: end, currentPeriodStart: new Date(end.getTime() - 30 * DAY) },
  });
  return end;
}

const runCron = () => t.queue.runScheduled(SUBSCRIPTION_RENEW_JOB);

async function notes(userId: string, type: string) {
  return t.prisma.notification.count({ where: { userId, type } });
}

describe('Админ: сарын багц', () => {
  it('CRUD + audit; админ бус 403; хэрэглэгчид зөвхөн идэвхтэй; ашиглагдсан багц устгахгүй', async () => {
    const a = await admin();
    const plan = await createPlan(a.agent);
    const hidden = await createPlan(a.agent, { name: 'Нууц', active: false });
    await a.agent
      .patch(`/admin/subscription-plans/${plan.id}`)
      .send({ priceMnt: 12_000, credits: 25 })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ priceMnt: 12_000, credits: 25, active: true }));
    await a.agent.post('/admin/subscription-plans').send({ name: 'x', priceMnt: 0, credits: 1 }).expect(400);
    await a.agent.delete(`/admin/subscription-plans/${hidden.id}`).expect(204);

    const audit = await t.prisma.auditLog.findMany({ where: { targetType: 'subscription_plan' }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((r) => r.action)).toEqual([
      'subscription_plan.create',
      'subscription_plan.create',
      'subscription_plan.update',
      'subscription_plan.delete',
    ]);
    expect(audit[2]).toMatchObject({ before: expect.objectContaining({ priceMnt: 15_000 }), after: expect.objectContaining({ priceMnt: 12_000 }) });

    const u = await loginByEmail(t, 'learner@example.mn');
    await u.agent.get('/admin/subscription-plans').expect(403);
    await u.agent.post('/admin/subscription-plans').send({ name: 'x', priceMnt: 1, credits: 1 }).expect(403);
    await u.agent.patch(`/admin/subscription-plans/${plan.id}`).send({ priceMnt: 1 }).expect(403);
    await u.agent.delete(`/admin/subscription-plans/${plan.id}`).expect(403);
    await t.http().get('/admin/subscription-plans').expect(401);

    await createPlan(a.agent, { name: 'Идэвхгүй', active: false });
    const plans = (await u.agent.get('/subscription/plans').expect(200)).body;
    expect(plans.map((p: { name: string }) => p.name)).toEqual(['Сарын 20']);

    await subscribeByInvoice(u.agent, plan.id);
    await a.agent.delete(`/admin/subscription-plans/${plan.id}`).expect(409);
  });
});

describe('Эхлэх', () => {
  it('нэхэмжлэхээр: INCOMPLETE → (callback, QPay шалгалт) → ACTIVE, нэг удаа кредит, үе 1 сар, мэдэгдэл', async () => {
    const { plan, u } = await setup();
    expect((await overview(u.agent)).subscription).toBeNull();

    const started = (await u.agent.post('/subscription').send({ planId: plan.id }).expect(201)).body;
    expect(started.overview.subscription).toMatchObject({ status: 'INCOMPLETE', nextRenewalAt: null });
    expect(started.payment).toMatchObject({ status: 'PENDING', method: 'INVOICE', amountMnt: 15_000, credits: 20 });
    expect(started.payment.qrImage).toEqual(expect.any(String));
    expect(started.payment.deeplinks.length).toBeGreaterThan(0);
    expect((await overview(u.agent)).pendingPayment.id).toBe(started.payment.id);

    const inv = t.qpay.last()!;
    const cb = callbackPathOf(inv.invoiceId);
    expect(cb).toMatch(/^\/payments\/qpay\/subscription-callback\/[\w-]{40,}$/);

    // Төлөөгүй үед шалгавал PENDING
    await u.agent
      .post(`/subscription/payments/${started.payment.id}/check`)
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('PENDING'));
    // Кредит цэнэглэлтийн route энэ төлбөрийг танихгүй
    await t.http().post(cb.replace('subscription-callback', 'callback')).expect(404);
    await u.agent.get(`/credits/topups/${started.payment.id}`).expect(404);

    t.qpay.markPaid(inv.invoiceId);
    await Promise.all([t.http().post(cb), t.http().get(cb), t.http().post(cb).send({ status: 'PAID' })]);
    await t.http().post(cb).expect(200).expect((r) => expect(r.body.status).toBe('PAID'));
    await u.agent.post(`/subscription/payments/${started.payment.id}/check`).expect(200);

    const ov = await overview(u.agent);
    expect(ov.subscription.status).toBe('ACTIVE');
    expect(ov.pendingPayment).toBeNull();
    const start = new Date(ov.subscription.currentPeriodStart);
    const end = new Date(ov.subscription.currentPeriodEnd);
    expect(Math.round((end.getTime() - start.getTime()) / DAY)).toBeGreaterThanOrEqual(28);
    expect(ov.subscription.nextRenewalAt).toBe(ov.subscription.currentPeriodEnd);

    expect(await balanceOf(u.agent)).toBe(20);
    const lots = await t.prisma.creditLot.findMany();
    expect(lots).toEqual([expect.objectContaining({ source: 'SUBSCRIPTION_GRANT', initial: 20, paymentId: started.payment.id })]);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'SUBSCRIPTION_GRANT' } })).toBe(1);
    expect(await t.prisma.subscriptionPeriod.count()).toBe(1);
    expect(await notes(u.user.id, 'SUBSCRIPTION_ACTIVATED')).toBe(1);
    await t.queue.drain();
    expect(t.email.last('learner@example.mn')?.subject).toContain('сарын багц идэвхжлээ');
  });

  it('хуурамч callback: QPay-д төлөгдөөгүй бол юу ч олгохгүй; мэдэгдэхгүй токен 404', async () => {
    const { plan, u } = await setup();
    await u.agent.post('/subscription').send({ planId: plan.id }).expect(201);
    const cb = callbackPathOf(t.qpay.last()!.invoiceId);

    await t.http().post(cb).send({ payment_status: 'PAID', paid_amount: 15_000 }).expect(200)
      .expect((r) => expect(r.body.status).toBe('PENDING'));
    await t.http().post('/payments/qpay/subscription-callback/' + 'x'.repeat(43)).expect(404);
    await t.http().post('/payments/qpay/subscription-callback/bad').expect(404);

    expect((await overview(u.agent)).subscription.status).toBe('INCOMPLETE');
    expect(await balanceOf(u.agent)).toBe(0);
    expect(await t.prisma.creditLot.count()).toBe(0);
  });

  it('холбосон картаар: шууд ACTIVE; карт татгалзвал нэхэмжлэх рүү шилжинэ', async () => {
    const { plan, u } = await setup();
    await linkCard(u.agent);
    await u.agent.post('/subscription/card').expect(409); // аль хэдийн холбосон

    t.qpay.declineNextCharge();
    const first = (await u.agent.post('/subscription').send({ planId: plan.id }).expect(201)).body;
    expect(first.payment).toMatchObject({ method: 'INVOICE', status: 'PENDING' });
    expect(first.overview.subscription.status).toBe('INCOMPLETE');
    expect(await t.prisma.payment.count({ where: { method: 'CARD', status: 'FAILED' } })).toBe(1);

    // Дахин эхлүүлэх (INCOMPLETE) → хуучин нэхэмжлэх цуцлагдана, карт амжилттай
    const second = (await u.agent.post('/subscription').send({ planId: plan.id }).expect(201)).body;
    expect(second.payment).toMatchObject({ method: 'CARD', status: 'PAID' });
    expect(second.overview.subscription.status).toBe('ACTIVE');
    expect(await t.prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } })).toMatchObject({ status: 'CANCELED' });
    expect(t.qpay.invoices.find((i) => i.input.senderInvoiceNo === first.payment.id.replace(/-/g, ''))?.canceled).toBe(true);
    expect(t.qpay.charges.map((c) => c.result.status)).toEqual(['DECLINED', 'PAID']);
    expect(t.qpay.charges[1]!.amountMnt).toBe(15_000);
    expect(await balanceOf(u.agent)).toBe(20);
    expect(await notes(u.user.id, 'SUBSCRIPTION_ACTIVATED')).toBe(1);

    // Карт салгах
    const ov = (await u.agent.delete('/subscription/card').expect(200)).body;
    expect(ov.card).toBeNull();
    expect(t.qpay.cards[0]!.removed).toBe(true);
  });
});

describe('Сунгалт (cron)', () => {
  it('картаар амжилттай: давхар ба зэрэг cron → нэг л удаа, үе тасралтгүй урагшилна', async () => {
    const { plan, u } = await setup();
    await linkCard(u.agent);
    await u.agent.post('/subscription').send({ planId: plan.id }).expect(201);
    const oldEnd = await endCurrentPeriod(u.user.id);

    await Promise.all([service.runRenewals(), service.runRenewals(), runCron()]);
    await runCron();

    const sub = await subRow(u.user.id);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.currentPeriodStart!.getTime()).toBe(oldEnd.getTime());
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    expect(await balanceOf(u.agent)).toBe(40);
    expect(t.qpay.charges.filter((c) => c.result.status === 'PAID')).toHaveLength(2);
    expect(await t.prisma.subscriptionPeriod.count()).toBe(2);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'SUBSCRIPTION_GRANT' } })).toBe(2);
    expect(await notes(u.user.id, 'SUBSCRIPTION_RENEWED')).toBe(1);
    expect(await notes(u.user.id, 'SUBSCRIPTION_PAYMENT_FAILED')).toBe(0);
  });

  it('карт байхгүй → PAST_DUE + нэхэмжлэх + мэдэгдэл (давхар cron нэг нэхэмжлэх); PAST_DUE үед төлбөл ACTIVE', async () => {
    const { plan, u } = await setup();
    await subscribeByInvoice(u.agent, plan.id);
    const oldEnd = await endCurrentPeriod(u.user.id);
    const invoicesBefore = t.qpay.invoices.length;

    await Promise.all([runCron(), service.runRenewals()]);
    await runCron();

    let ov = await overview(u.agent);
    expect(ov.subscription).toMatchObject({ status: 'PAST_DUE', nextRenewalAt: null });
    expect(ov.subscription.pauseAt).toEqual(expect.any(String));
    expect(ov.pendingPayment).toMatchObject({ status: 'PENDING', method: 'INVOICE', renewalFor: oldEnd.toISOString() });
    expect(t.qpay.invoices.length).toBe(invoicesBefore + 1);
    expect(await t.prisma.payment.count({ where: { renewalFor: oldEnd } })).toBe(1);
    expect(await notes(u.user.id, 'SUBSCRIPTION_PAYMENT_FAILED')).toBe(1);

    // "Төлөх" → ижил нэхэмжлэх (шинээр үүсгэхгүй)
    const pay = (await u.agent.post('/subscription/pay').expect(200)).body;
    expect(pay.payment.id).toBe(ov.pendingPayment.id);
    expect(t.qpay.invoices.length).toBe(invoicesBefore + 1);

    // Callback алдагдсан ч cron QPay-ээс шалгаж олгоно
    t.qpay.markPaid(t.qpay.last()!.invoiceId);
    await runCron();
    ov = await overview(u.agent);
    expect(ov.subscription.status).toBe('ACTIVE');
    expect(ov.subscription.currentPeriodStart).toBe(oldEnd.toISOString());
    expect(ov.subscription.pastDueSince).toBeNull();
    expect(await balanceOf(u.agent)).toBe(40);
    expect(await notes(u.user.id, 'SUBSCRIPTION_RENEWED')).toBe(1);

    // Дахин callback → давхар олголтгүй
    await t.http().post(callbackPathOf(t.qpay.last()!.invoiceId)).expect(200);
    expect(await balanceOf(u.agent)).toBe(40);
  });

  it('карт татгалзвал PAST_DUE → 3 хоног төлөөгүй бол PAUSED (нэхэмжлэх цуцлагдана) → дахин идэвхжүүлэх', async () => {
    const { plan, u } = await setup();
    await linkCard(u.agent);
    await u.agent.post('/subscription').send({ planId: plan.id }).expect(201);
    await endCurrentPeriod(u.user.id);

    t.qpay.declineNextCharge();
    await runCron();
    expect((await subRow(u.user.id)).status).toBe('PAST_DUE');
    expect(await t.prisma.payment.count({ where: { method: 'CARD', status: 'FAILED' } })).toBe(1);
    const renewalInvoice = await t.prisma.payment.findFirstOrThrow({ where: { method: 'INVOICE', status: 'PENDING' } });

    // 2 хоног → хэвээр PAST_DUE
    await t.prisma.subscription.update({ where: { userId: u.user.id }, data: { pastDueSince: new Date(Date.now() - 2 * DAY) } });
    await runCron();
    expect((await subRow(u.user.id)).status).toBe('PAST_DUE');

    // 3+ хоног → PAUSED (давхар cron нэг л мэдэгдэл)
    await t.prisma.subscription.update({ where: { userId: u.user.id }, data: { pastDueSince: new Date(Date.now() - 3 * DAY - 60_000) } });
    await Promise.all([runCron(), service.runRenewals()]);
    const paused = await subRow(u.user.id);
    expect(paused.status).toBe('PAUSED');
    expect(paused.pausedAt).not.toBeNull();
    expect(await t.prisma.payment.findUniqueOrThrow({ where: { id: renewalInvoice.id } })).toMatchObject({ status: 'CANCELED' });
    expect(await notes(u.user.id, 'SUBSCRIPTION_PAUSED')).toBe(1);
    expect(await balanceOf(u.agent)).toBe(20); // олгосон кредит хэвээр

    // PAUSED үед "төлөх" боломжгүй; дахин идэвхжүүлэх → картаар → ACTIVE, шинэ үе одоогоос
    await u.agent.post('/subscription/pay').expect(409);
    const before = Date.now();
    const re = (await u.agent.post('/subscription/reactivate').expect(200)).body;
    expect(re.payment).toMatchObject({ method: 'CARD', status: 'PAID' });
    expect(re.overview.subscription.status).toBe('ACTIVE');
    expect(new Date(re.overview.subscription.currentPeriodStart).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await balanceOf(u.agent)).toBe(40);
  });
});

describe('Цуцлах ба дахин идэвхжүүлэх', () => {
  it('цуцлахад кредит үлдэж, сунгалт зогсоно; дахин идэвхжүүлэх нэхэмжлэхээр', async () => {
    const { plan, u } = await setup();
    await subscribeByInvoice(u.agent, plan.id);

    const ov = (await u.agent.post('/subscription/cancel').expect(200)).body;
    expect(ov.subscription).toMatchObject({ status: 'CANCELED', nextRenewalAt: null });
    expect(ov.subscription.canceledAt).toEqual(expect.any(String));
    expect(await balanceOf(u.agent)).toBe(20);
    expect(await notes(u.user.id, 'SUBSCRIPTION_CANCELED')).toBe(1);

    await endCurrentPeriod(u.user.id);
    const payments = await t.prisma.payment.count();
    await runCron();
    expect((await subRow(u.user.id)).status).toBe('CANCELED');
    expect(await t.prisma.payment.count()).toBe(payments);

    await u.agent.post('/subscription/cancel').expect(409);
    const re = (await u.agent.post('/subscription/reactivate').expect(200)).body;
    expect(re.payment).toMatchObject({ method: 'INVOICE', status: 'PENDING' });
    expect(re.overview.subscription.status).toBe('CANCELED'); // төлбөр орох хүртэл
    t.qpay.markPaid(t.qpay.last()!.invoiceId);
    await u.agent.post(`/subscription/payments/${re.payment.id}/check`).expect(200);
    expect((await overview(u.agent)).subscription.status).toBe('ACTIVE');
    expect(await balanceOf(u.agent)).toBe(40);
    expect(await notes(u.user.id, 'SUBSCRIPTION_ACTIVATED')).toBe(2);
  });

  it('PAST_DUE үед цуцлах: аль хэдийн төлөгдсөн нэхэмжлэхийг олгоод цуцална; төлөгдөөгүйг QPay дээр цуцална', async () => {
    const { plan, u } = await setup();
    await subscribeByInvoice(u.agent, plan.id);
    await endCurrentPeriod(u.user.id);
    await runCron();
    const inv = t.qpay.last()!;
    // Хэрэглэгч төлсөн ч callback ирээгүй
    t.qpay.markPaid(inv.invoiceId);
    await u.agent.post('/subscription/cancel').expect(200);
    expect((await subRow(u.user.id)).status).toBe('CANCELED');
    expect(await balanceOf(u.agent)).toBe(40);
    expect(inv.canceled).toBe(true);

    // Өөр хэрэглэгч: төлөөгүй нэхэмжлэх → CANCELED
    const v = await loginByEmail(t, 'second@example.mn');
    await subscribeByInvoice(v.agent, plan.id);
    await endCurrentPeriod(v.user.id);
    await runCron();
    const pending = (await overview(v.agent)).pendingPayment;
    await v.agent.post('/subscription/cancel').expect(200);
    expect(await t.prisma.payment.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'CANCELED' });
    // Цуцалсан нэхэмжлэхийн callback юу ч олгохгүй
    t.qpay.markPaid(t.qpay.last()!.invoiceId);
    await t.http().post(callbackPathOf(t.qpay.last()!.invoiceId)).expect(200).expect((r) => expect(r.body.status).toBe('CANCELED'));
    expect(await balanceOf(v.agent)).toBe(20);
  });
});

describe('Төлөвийн машин', () => {
  it('хүснэгт: зөвшөөрөгдсөн шилжилтүүд', () => {
    expect(TRANSITIONS).toEqual({
      INCOMPLETE: ['ACTIVE', 'CANCELED'],
      ACTIVE: ['ACTIVE', 'PAST_DUE', 'CANCELED'],
      PAST_DUE: ['ACTIVE', 'PAUSED', 'CANCELED'],
      PAUSED: ['ACTIVE', 'CANCELED'],
      CANCELED: ['ACTIVE'],
    });
  });

  it('буруу шилжилт → 409, бүртгэлгүй → 404', async () => {
    const { plan, u } = await setup();
    await u.agent.post('/subscription/cancel').expect(404);
    await u.agent.post('/subscription/reactivate').expect(404);
    await u.agent.post('/subscription/pay').expect(404);

    // INCOMPLETE
    await u.agent.post('/subscription').send({ planId: plan.id }).expect(201);
    await u.agent.post('/subscription/reactivate').expect(409);
    await u.agent.post('/subscription/pay').expect(409);

    // ACTIVE
    t.qpay.markPaid(t.qpay.last()!.invoiceId);
    await t.http().post(callbackPathOf(t.qpay.last()!.invoiceId)).expect(200);
    for (const [path, body] of [
      ['/subscription', { planId: plan.id }],
      ['/subscription/reactivate', {}],
      ['/subscription/pay', {}],
    ] as const) {
      await u.agent
        .post(path)
        .send(body)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('INVALID_SUBSCRIPTION_TRANSITION'));
    }

    // PAST_DUE
    await endCurrentPeriod(u.user.id);
    await runCron();
    await u.agent.post('/subscription').send({ planId: plan.id }).expect(409);
    await u.agent.post('/subscription/reactivate').expect(409);

    // INCOMPLETE → CANCELED (өөр хэрэглэгч), CANCELED → cancel/pay 409
    const v = await loginByEmail(t, 'second@example.mn');
    await v.agent.post('/subscription').send({ planId: plan.id }).expect(201);
    await v.agent.post('/subscription/cancel').expect(200);
    await v.agent.post('/subscription/cancel').expect(409);
    await v.agent.post('/subscription/pay').expect(409);

    // Идэвхгүй/байхгүй багц
    await v.agent.post('/subscription').send({ planId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    // Карт салгах — холбоогүй
    await v.agent.delete('/subscription/card').expect(404);
  });
});

describe('Сунгалтын өмнөх сануулга (ticket 25)', () => {
  const TYPES = ['SUBSCRIPTION_RENEWAL_REMINDER_CARD', 'SUBSCRIPTION_RENEWAL_REMINDER_INVOICE'];
  const reminders = (userId: string) => t.prisma.notification.findMany({ where: { userId, type: { in: TYPES } } });
  const setEnd = (userId: string, end: Date) =>
    t.prisma.subscription.update({ where: { userId }, data: { currentPeriodEnd: end } });

  it('N хоногийн дотор: нэг л удаа (давхар/зэрэг cron), нэхэмжлэхийн текст, имэйл; хол үед илгээхгүй', async () => {
    const { plan, u } = await setup();
    await subscribeByInvoice(u.agent, plan.id);

    // Анхдагч 3 хоног: 10 хоног үлдсэн → алга
    await setEnd(u.user.id, new Date(Date.now() + 10 * DAY));
    await runCron();
    expect(await reminders(u.user.id)).toHaveLength(0);

    // 2 хоног үлдсэн → нэг сануулга, давхар/зэрэг ажилд ч нэг л
    await setEnd(u.user.id, new Date(Date.now() + 2 * DAY));
    const counts = await Promise.all([service.runRenewalReminders(), service.runRenewalReminders(), service.runRenewalReminders()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    await runCron();
    const rows = await reminders(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'SUBSCRIPTION_RENEWAL_REMINDER_INVOICE', link: '/subscription' });
    expect(rows[0]!.params).toMatchObject({ plan: 'Сарын 20' });

    await t.queue.drain();
    const mail = t.email.last('learner@example.mn');
    expect(mail?.subject).toContain('сарын багцын сунгалт');
    expect(mail?.text).toContain('QPay нэхэмжлэх');
    expect(mail?.text).not.toContain('автоматаар татагдана');
    // Төлбөрийн төлөвт нөлөөлөхгүй
    expect((await subRow(u.user.id)).status).toBe('ACTIVE');
  });

  it('карт холбосон бол автомат татах текст; үе сунгагдсаны дараа дараагийн үед дахин нэг сануулга', async () => {
    const { plan, u } = await setup();
    await linkCard(u.agent);
    await u.agent.post('/subscription').send({ planId: plan.id }).expect(201);

    await setEnd(u.user.id, new Date(Date.now() + DAY));
    await runCron();
    const first = await reminders(u.user.id);
    expect(first).toHaveLength(1);
    expect(first[0]!.type).toBe('SUBSCRIPTION_RENEWAL_REMINDER_CARD');
    expect(first[0]!.params).toMatchObject({ amount: expect.stringMatching(/15/) });
    await t.queue.drain();
    expect(t.email.last('learner@example.mn')?.text).toContain('автоматаар татагдана');

    // Үе дуусч карт автоматаар сунгагдана → шинэ үе; дахин сануулга хараахан эрт
    await endCurrentPeriod(u.user.id);
    await runCron();
    expect((await subRow(u.user.id)).status).toBe('ACTIVE');
    expect(await reminders(u.user.id)).toHaveLength(1);

    // Дараагийн үе дуусахад ойртвол дахин (нэг) сануулга
    await setEnd(u.user.id, new Date(Date.now() + 2 * DAY));
    await runCron();
    await runCron();
    expect(await reminders(u.user.id)).toHaveLength(2);
  });

  it('цуцалсан/зогссон/хоцорсон/INCOMPLETE багцад илгээхгүй', async () => {
    const { plan, u } = await setup();
    await subscribeByInvoice(u.agent, plan.id);
    await u.agent.post('/subscription/cancel').expect(200);
    await setEnd(u.user.id, new Date(Date.now() + DAY));
    await runCron();
    expect((await subRow(u.user.id)).status).toBe('CANCELED');
    for (const status of ['PAUSED', 'PAST_DUE', 'INCOMPLETE'] as const) {
      await t.prisma.subscription.update({ where: { userId: u.user.id }, data: { status } });
      expect(await service.runRenewalReminders()).toBe(0);
    }
    expect(await reminders(u.user.id)).toHaveLength(0);
  });

  it('босго админ тохиргооноос (subscriptionReminderDays) уншигдана; Улаанбаатарын өдрөөр', async () => {
    const { a, plan, u } = await setup();
    await subscribeByInvoice(u.agent, plan.id);
    await setEnd(u.user.id, new Date(Date.now() + 5 * DAY));
    expect(await service.runRenewalReminders()).toBe(0);

    await a.agent.put('/admin/settings/subscriptionReminderDays').send({ value: 7 }).expect(200);
    expect(await service.runRenewalReminders()).toBe(1);
    expect((await reminders(u.user.id))[0]!.params).toMatchObject({ days: expect.any(Number) });
    const days = (await reminders(u.user.id))[0]!.params as { days: number };
    expect([4, 5]).toContain(days.days); // UB өдрийн хил дээр 1 өдрөөр зөрж болно

    // Тогтмол цаг: 2026-03-10 20:00 UTC = UB 03-11 04:00. Үе 03-14 02:00 UTC (UB 03-14 10:00) → 3 өдөр → N=3 дотор
    const fixedNow = new Date('2026-03-10T20:00:00Z');
    await t.prisma.subscription.update({
      where: { userId: u.user.id },
      data: { currentPeriodEnd: new Date('2026-03-14T02:00:00Z'), renewalRemindedFor: null },
    });
    await a.agent.put('/admin/settings/subscriptionReminderDays').send({ value: 2 }).expect(200);
    expect(await service.runRenewalReminders(fixedNow)).toBe(0);
    await a.agent.put('/admin/settings/subscriptionReminderDays').send({ value: 3 }).expect(200);
    expect(await service.runRenewalReminders(fixedNow)).toBe(1);
  });
});
