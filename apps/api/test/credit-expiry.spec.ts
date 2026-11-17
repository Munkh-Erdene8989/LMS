import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { CREDIT_EXPIRY_CRON, CREDIT_EXPIRY_JOB, CreditExpiryService } from '../src/credits/expiry.service';
import { NOTIFICATION_EMAIL_JOB } from '../src/notifications/notifications.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт) + зэрэг transaction-ууд.
jest.setTimeout(180_000);

const DAY = 24 * 60 * 60_000;

let t: TestApp;
let credits: CreditsService;
let expiry: CreditExpiryService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
  expiry = t.app.get(CreditExpiryService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

async function user(email: string): Promise<string> {
  return (await loginByEmail(t, email)).user.id as string;
}

/** `expiresAt`-тэй lot (grant-аар үүсгээд дуусах огноог fixture-ээр тохируулна). */
async function lot(userId: string, amount: number, expiresAt: Date, opts: { isTest?: boolean } = {}): Promise<string> {
  const { lotId } = await t.prisma.$transaction(
    (tx) => credits.grant(tx, { userId, credits: amount, source: 'TOPUP', isTest: opts.isTest }),
    CREDIT_TX_OPTIONS,
  );
  await t.prisma.creditLot.update({ where: { id: lotId }, data: { expiresAt } });
  return lotId;
}

function spend(userId: string, amount: number, now?: Date) {
  return t.prisma.$transaction((tx) => credits.spend(tx, { userId, credits: amount, now }), CREDIT_TX_OPTIONS);
}

async function ledgerSum(userId: string): Promise<number> {
  const agg = await t.prisma.creditLedgerEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

async function remainingSum(userId: string): Promise<number> {
  const agg = await t.prisma.creditLot.aggregate({ where: { userId }, _sum: { remaining: true } });
  return agg._sum.remaining ?? 0;
}

function notificationsOf(type: string, userId?: string) {
  return t.prisma.notification.findMany({ where: { type, ...(userId ? { userId } : {}) }, orderBy: { createdAt: 'asc' } });
}

function sumParam(rows: { params: unknown }[], key: string): number {
  return rows.reduce((s, r) => s + Number((r.params as Record<string, unknown>)[key]), 0);
}

describe('Өдөр тутмын дуусгаврын cron', () => {
  it('00:10-д бүртгэгдсэн; дууссан lot-ыг EXPIRE-ээр хасч мэдэгдэнэ, дахин ажиллахад юу ч давхардахгүй', async () => {
    expect(t.queue.schedules.get(CREDIT_EXPIRY_JOB)).toBe(CREDIT_EXPIRY_CRON);
    expect(CREDIT_EXPIRY_CRON).toBe('10 0 * * *');

    const u = await user('learner@example.mn');
    const expired = await lot(u, 7, new Date(Date.now() - 60 * 60_000));
    const empty = await lot(u, 3, new Date(Date.now() - 2 * 60 * 60_000));
    await spend(u, 3, new Date(Date.now() - 3 * 60 * 60_000)); // дуусахаас өмнө бүгдийг зарцуулсан (FIFO: эрт дуусах)
    await lot(u, 2, new Date(Date.now() + 90 * DAY));

    await t.queue.runScheduled(CREDIT_EXPIRY_JOB);
    await t.queue.runScheduled(CREDIT_EXPIRY_JOB);
    expect(t.queue.byName(CREDIT_EXPIRY_JOB).every((j) => j.status === 'completed')).toBe(true);

    const entries = await t.prisma.creditLedgerEntry.findMany({ where: { type: 'EXPIRE' }, include: { allocations: true } });
    expect(entries).toEqual([
      expect.objectContaining({ userId: u, amount: -7, isTest: false, allocations: [expect.objectContaining({ lotId: expired, amount: -7 })] }),
    ]);
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: expired } })).toMatchObject({
      remaining: 0,
      expiredAt: expect.any(Date),
    });
    // Хоосон lot-д EXPIRE бичилт үүсэхгүй
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: empty } })).toMatchObject({ expiredAt: null });

    const notes = await notificationsOf('CREDITS_EXPIRED', u);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ params: { credits: 7 }, link: '/credits', emailStatus: 'SENT' });

    // runScheduled дараалалыг drain хийдэг тул имэйл ч илгээгдсэн
    expect(t.email.last('learner@example.mn')?.subject).toContain('7 кредитийн хугацаа дууслаа');

    expect(await credits.balance(u)).toBe(2);
    expect(await ledgerSum(u)).toBe(2);
    const history = (await (await loginByEmail(t, 'learner@example.mn')).agent.get('/credits/history').expect(200)).body;
    expect(history.items[0]).toMatchObject({ type: 'EXPIRE', amount: -7 });
  });

  it('FIFO + дуусгавар: эхлээд эрт дуусах lot-оос; дууссан lot-оос (cron-оос өмнө ч) хэзээ ч зарцуулахгүй', async () => {
    const u = await user('fifo@example.mn');
    const now = new Date();
    const early = await lot(u, 5, new Date(now.getTime() + 2 * DAY));
    const late = await lot(u, 5, new Date(now.getTime() + 60 * DAY));

    // Одоо: эрт дуусах lot-оос
    const s1 = await spend(u, 3, now);
    expect(s1.allocations).toEqual([expect.objectContaining({ lotId: early, credits: 3 })]);
    expect(await credits.balance(u, t.prisma, now)).toBe(7);

    // 3 хоногийн дараа, cron ажиллаагүй байхад: early дууссан тул баланст орохгүй, зарцуулахгүй
    const later = new Date(now.getTime() + 3 * DAY);
    expect(await credits.balance(u, t.prisma, later)).toBe(5);
    const s2 = await spend(u, 1, later);
    expect(s2.allocations).toEqual([expect.objectContaining({ lotId: late, credits: 1 })]);
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: early } })).toMatchObject({ remaining: 2 });

    // Cron: early-ийн үлдсэн 2-ыг хасна
    const r = await expiry.run(later);
    expect(r.expiredLots).toBe(1);
    const exp = await t.prisma.creditLedgerEntry.findMany({ where: { userId: u, type: 'EXPIRE' } });
    expect(exp).toEqual([expect.objectContaining({ amount: -2 })]);

    expect(await credits.balance(u, t.prisma, later)).toBe(4);
    await expect(spend(u, 5, later)).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_CREDITS' } });
    const s3 = await spend(u, 4, later);
    expect(s3.allocations).toEqual([expect.objectContaining({ lotId: late, credits: 4 })]);

    // Ledger: +5 +5 −3 −1 −2 −4 = 0; lot тус бүрийн allocation нийлбэр = remaining
    expect(await ledgerSum(u)).toBe(0);
    expect(await remainingSum(u)).toBe(0);
    for (const id of [early, late]) {
      const agg = await t.prisma.creditAllocation.aggregate({ where: { lotId: id }, _sum: { amount: true } });
      expect(agg._sum.amount).toBe(0);
    }
  });

  it('зэрэг ажилласан cron-ууд lot бүрийг нэг л удаа дуусгаж, мэдэгдлийг давхардуулахгүй', async () => {
    const users = [await user('c1@example.mn'), await user('c2@example.mn')];
    const past = new Date(Date.now() - DAY);
    const lots: string[] = [];
    for (const u of users) {
      lots.push(await lot(u, 4, past), await lot(u, 6, past));
      await lot(u, 1, new Date(Date.now() + 20 * DAY)); // сануулга
    }

    const runs = await Promise.all([expiry.run(), expiry.run(), expiry.run()]);
    expect(runs.reduce((s, r) => s + r.expiredLots, 0)).toBe(4);
    expect(runs.reduce((s, r) => s + r.remindedLots[30], 0)).toBe(2);

    const allocs = await t.prisma.creditAllocation.findMany({ where: { lotId: { in: lots }, amount: { lt: 0 } } });
    expect(allocs).toHaveLength(4);
    expect(new Set(allocs.map((a) => a.lotId)).size).toBe(4);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'EXPIRE' } })).toBe(4);

    // Мэдэгдэлд орсон кредитийн нийлбэр = дуусгасан / сануулсан нийт (давхардалгүй)
    expect(sumParam(await notificationsOf('CREDITS_EXPIRED'), 'credits')).toBe(20);
    expect(sumParam(await notificationsOf('CREDITS_EXPIRING'), 'credits')).toBe(2);

    for (const u of users) {
      expect(await ledgerSum(u)).toBe(1);
      expect(await credits.balance(u)).toBe(1);
    }

    // Дахин ажиллахад юу ч өөрчлөгдөхгүй
    expect(await expiry.run()).toEqual({ expiredLots: 0, remindedLots: { 7: 0, 30: 0 }, notifications: 0 });
  });

  it('зарцуулалт ба дуусгавар зэрэг: үлдэгдэл давхар тоологдохгүй, сөрөг болохгүй', async () => {
    const u = await user('race@example.mn');
    const expiresAt = new Date(Date.now() + 1000);
    await lot(u, 100, new Date(Date.now() + 90 * DAY));
    const before = new Date(expiresAt.getTime() - 500);
    const after = new Date(expiresAt.getTime() + 500);

    for (let i = 0; i < 3; i++) {
      const a = await lot(u, 10, expiresAt);
      const [spent, expired] = await Promise.all([spend(u, 4, before), credits.expireDueLots(after)]);
      const lotRow = await t.prisma.creditLot.findUniqueOrThrow({ where: { id: a } });
      expect(lotRow).toMatchObject({ remaining: 0, expiredAt: after });
      const fromA = spent.allocations.find((x) => x.lotId === a)?.credits ?? 0;
      // Аль нь түрүүлснээс үл хамааран: зарцуулсан + дуусгасан = 10
      expect(fromA === 4 || fromA === 0).toBe(true);
      expect(expired).toEqual([expect.objectContaining({ lotId: a, credits: 10 - fromA })]);
      const agg = await t.prisma.creditAllocation.aggregate({ where: { lotId: a }, _sum: { amount: true } });
      expect(agg._sum.amount).toBe(0);
    }
    expect(await t.prisma.creditLot.count({ where: { remaining: { lt: 0 } } })).toBe(0);
    expect(await ledgerSum(u)).toBe(await remainingSum(u));
    expect(await credits.balance(u)).toBe(await remainingSum(u));
  });
});

describe('Дуусахаас өмнөх сануулга', () => {
  it('30 / 7 хоногийн сануулга lot бүрт нэг удаа, хэрэглэгч бүрт нэгтгэсэн нэг мэдэгдэл; хоосон lot-д үгүй', async () => {
    const u = await user('remind@example.mn');
    const other = await user('other@example.mn');
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() + days * DAY);

    const l25 = await lot(u, 5, at(25));
    const l28 = await lot(u, 3, at(28), { isTest: true }); // тест lot-д ч сануулна
    const l6 = await lot(u, 2, at(6));
    const empty = await lot(u, 4, at(20));
    await t.prisma.creditLot.update({ where: { id: empty }, data: { remaining: 0 } });
    await lot(u, 9, at(60)); // хол
    const o40 = await lot(other, 1, at(40));

    // Өдөр 0: l6 → 7 хоногийн, l25 + l28 → 30 хоногийн. Нэг мэдэгдэл.
    let r = await expiry.run(now);
    expect(r).toMatchObject({ expiredLots: 0, remindedLots: { 7: 1, 30: 2 }, notifications: 1 });
    let notes = await notificationsOf('CREDITS_EXPIRING', u);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.params).toEqual({
      credits: 10,
      days: 6,
      expiresAt: at(6).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ulaanbaatar' }),
    });
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: l6 } })).toMatchObject({
      remind7SentAt: now,
      remind30SentAt: now,
    });
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: empty } })).toMatchObject({
      remind7SentAt: null,
      remind30SentAt: null,
    });
    expect(await notificationsOf('CREDITS_EXPIRING', other)).toHaveLength(0);

    // Имэйл: нэгтгэсэн текст
    expect(t.queue.byName(NOTIFICATION_EMAIL_JOB).length).toBeGreaterThan(0);
    await t.queue.drain();
    const mail = t.email.last('remind@example.mn')!;
    expect(mail.subject).toContain('10 кредитийн хугацаа дуусах гэж байна');
    expect(mail.text).toContain('6 хоногийн дараа');

    // Мөн өдөр дахин → юу ч үгүй
    expect(await expiry.run(new Date(now.getTime() + 60_000))).toMatchObject({ notifications: 0 });

    // Өдөр 20: l6 дууссан (мэдэгдэл), l25 → 7 хоног (5 хоног үлдсэн), other-ийн lot → 30 хоног
    r = await expiry.run(at(20));
    expect(r).toMatchObject({ expiredLots: 1, remindedLots: { 7: 1, 30: 1 }, notifications: 3 });
    expect((await notificationsOf('CREDITS_EXPIRED', u)).map((n) => n.params)).toEqual([{ credits: 2 }]);
    notes = await notificationsOf('CREDITS_EXPIRING', u);
    expect(notes).toHaveLength(2);
    expect(notes[1]!.params).toMatchObject({ credits: 5, days: 5 });
    expect((await notificationsOf('CREDITS_EXPIRING', other))[0]!.params).toMatchObject({ credits: 1, days: 20 });
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: o40 } })).toMatchObject({ remind7SentAt: null });

    // Өдөр 22: l28 (тест) → 7 хоног
    r = await expiry.run(at(22));
    expect(r).toMatchObject({ remindedLots: { 7: 1, 30: 0 }, notifications: 1 });
    expect((await notificationsOf('CREDITS_EXPIRING', u))[2]!.params).toMatchObject({ credits: 3, days: 6 });
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: l28 } })).toMatchObject({ remind7SentAt: at(22) });

    // Дахин → юу ч үгүй; lot бүрт босго тус бүр нэг л удаа
    expect(await expiry.run(at(22))).toMatchObject({ remindedLots: { 7: 0, 30: 0 }, notifications: 0 });
    expect(await notificationsOf('CREDITS_EXPIRING', u)).toHaveLength(3);
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: l25 } })).toMatchObject({
      remind30SentAt: now,
      remind7SentAt: at(20),
    });
  });

  it('сануулсны дараа бүгдийг зарцуулбал 7 хоногийн сануулга очихгүй; зэрэг ажилд нэг л удаа', async () => {
    const u = await user('spent@example.mn');
    const now = new Date();
    const l = await lot(u, 3, new Date(now.getTime() + 25 * DAY));

    const runs = await Promise.all([expiry.run(now), expiry.run(now)]);
    expect(runs.reduce((s, r) => s + r.remindedLots[30], 0)).toBe(1);
    expect(await notificationsOf('CREDITS_EXPIRING', u)).toHaveLength(1);

    await spend(u, 3, now);
    await expiry.run(new Date(now.getTime() + 20 * DAY));
    expect(await notificationsOf('CREDITS_EXPIRING', u)).toHaveLength(1);
    expect(await t.prisma.creditLot.findUniqueOrThrow({ where: { id: l } })).toMatchObject({ remind7SentAt: null });
  });
});
