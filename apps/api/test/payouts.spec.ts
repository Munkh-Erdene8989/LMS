import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { TeacherEarningsService } from '../src/purchases/earnings.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
jest.setTimeout(180_000);

let t: TestApp;
let credits: CreditsService;
let earnings: TeacherEarningsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
  earnings = t.app.get(TeacherEarningsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

const BANK = { bank: 'KHAN', accountNumber: '5000123456', holderName: 'Бат-Эрдэнэ Д.' };

// ---------------------------------------------------------------------------
// Fixture-ууд
// ---------------------------------------------------------------------------

/** Банкны данстай багш (сонголтоор орлоготой) */
async function teacher(email = 'teacher@example.mn', opts: { balance?: number; bank?: boolean } = {}) {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  if (opts.bank !== false) await s.agent.put('/teacher/bank-account').send(BANK).expect(200);
  if (opts.balance) await earn(s.user.id, opts.balance);
  return s;
}

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

/** Ledger-т орлого нэмнэ (ADMIN_ADJUST — борлуулалтын бүрэн урсгалыг тусад нь тестэлсэн). */
async function earn(teacherId: string, amountMnt: number, isTest = false) {
  if (isTest) {
    await t.prisma.teacherEarningEntry.create({ data: { teacherId, type: 'ADMIN_ADJUST', amountMnt, isTest: true } });
    return;
  }
  await t.prisma.$transaction((tx) => earnings.append(tx, { teacherId, type: 'ADMIN_ADJUST', amountMnt, reason: 'fixture' }));
}

const view = async (a: Agent) => (await a.get('/teacher/payouts').expect(200)).body;
const requestPayout = (a: Agent) => a.post('/teacher/payouts');
const ledger = (teacherId: string) => earnings.balance(teacherId);

async function notifications(userId: string, type: string) {
  return t.prisma.notification.findMany({ where: { userId, type } });
}

// ---------------------------------------------------------------------------

describe('Payout хүсэлт: босго', () => {
  it('үлдэгдэл < 50,000₮ → 409 BELOW_MINIMUM; хүрмэгц бүтэн үлдэгдлээр хүсэлт', async () => {
    const tch = await teacher('teacher@example.mn', { balance: 49_999 });
    expect(await view(tch.agent)).toMatchObject({
      balanceMnt: 49_999,
      lockedMnt: 0,
      availableMnt: 49_999,
      minimumMnt: 50_000,
      onHold: false,
      hasBankAccount: true,
      blockReason: 'BELOW_MINIMUM',
      openPayout: null,
      items: [],
    });
    const below = await requestPayout(tch.agent).expect(409);
    expect(below.body.code).toBe('BELOW_MINIMUM');
    expect(await t.prisma.payout.count()).toBe(0);

    await earn(tch.user.id, 1);
    const res = await requestPayout(tch.agent).expect(201);
    expect(res.body).toMatchObject({ status: 'REQUESTED', amountMnt: 50_000, ...BANK, processedAt: null });
    // Хүсэлт ledger-т бичилт үүсгэхгүй — дүн зөвхөн түгжигдэнэ.
    expect(await t.prisma.teacherEarningEntry.count({ where: { type: 'PAYOUT' } })).toBe(0);
  });

  it('босго админы тохиргооноос (payoutMinimumMnt) уншигдана', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 30_000 });
    await requestPayout(tch.agent).expect(409);
    await a.agent.put('/admin/settings/payoutMinimumMnt').send({ value: 20_000 }).expect(200);
    expect((await view(tch.agent)).minimumMnt).toBe(20_000);
    expect((await requestPayout(tch.agent).expect(201)).body.amountMnt).toBe(30_000);
  });

  it('босго 0 байсан ч 0₮ / сөрөг үлдэгдлээр хүсэлт гаргахгүй', async () => {
    const a = await admin();
    await a.agent.put('/admin/settings/payoutMinimumMnt').send({ value: 0 }).expect(200);
    const tch = await teacher();
    expect((await requestPayout(tch.agent).expect(409)).body.code).toBe('BELOW_MINIMUM');
  });

  it('тест гүйлгээний орлого үлдэгдэлд, босгод тооцогдохгүй', async () => {
    const tch = await teacher('teacher@example.mn', { balance: 40_000 });
    await earn(tch.user.id, 100_000, true);
    expect((await view(tch.agent)).balanceMnt).toBe(40_000);
    expect((await requestPayout(tch.agent).expect(409)).body.code).toBe('BELOW_MINIMUM');
  });

  it('банкны данс бүртгээгүй бол 409 BANK_ACCOUNT_REQUIRED', async () => {
    const tch = await teacher('teacher@example.mn', { balance: 60_000, bank: false });
    expect(await view(tch.agent)).toMatchObject({ hasBankAccount: false, blockReason: 'NO_BANK_ACCOUNT' });
    expect((await requestPayout(tch.agent).expect(409)).body.code).toBe('BANK_ACCOUNT_REQUIRED');
  });

  it('бодит борлуулалтын орлого (кредит × ₮ × (1 − шимтгэл)) үлдэгдэлд зөв орно', async () => {
    const tch = await teacher();
    const c = await t.prisma.course.create({
      data: {
        teacherId: tch.user.id,
        title: 'Курс',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sections: { create: { title: '1', position: 0 } },
      },
      include: { sections: true },
    });
    const lesson = await t.prisma.lesson.create({
      data: {
        courseId: c.id,
        sectionId: c.sections[0]!.id,
        title: 'Хичээл',
        type: 'TEXT',
        position: 0,
        priceCredits: 100,
        reviewStatus: 'APPROVED',
        content: { markdown: 'x' },
      },
    });
    const u = await loginByEmail(t, 'learner@example.mn');
    await t.prisma.$transaction(
      (tx) => credits.grant(tx, { userId: u.user.id, credits: 100, source: 'ADMIN_ADJUST' }),
      CREDIT_TX_OPTIONS,
    );
    await u.agent.post(`/purchases/lessons/${lesson.id}`).send({ confirmNoRefund: true, expectedCredits: 100 }).expect(201);

    // 100 кр × 1000₮ × (100 − 40)% = 60,000₮
    expect((await view(tch.agent)).availableMnt).toBe(60_000);
    expect((await requestPayout(tch.agent).expect(201)).body.amountMnt).toBe(60_000);
  });
});

describe('Payout хүсэлт: түгжээ ба давхар хүсэлт', () => {
  it('хүсэлтийн дүн түгжигдэнэ; шинэ орлого боломжтой үлдэгдэлд; нээлттэй хүсэлт байхад дахин хүсэхгүй', async () => {
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;

    await earn(tch.user.id, 80_000);
    const v = await view(tch.agent);
    expect(v).toMatchObject({
      balanceMnt: 150_000,
      lockedMnt: 70_000,
      availableMnt: 80_000,
      blockReason: 'OPEN_REQUEST',
      openPayout: { id: p.id, amountMnt: 70_000 },
    });
    expect(v.items).toHaveLength(1);

    const again = await requestPayout(tch.agent).expect(409);
    expect(again.body.code).toBe('PAYOUT_ALREADY_OPEN');
    expect(await t.prisma.payout.count()).toBe(1);

    expect(await t.prisma.auditLog.count({ where: { action: 'payout.request', actorId: tch.user.id } })).toBe(1);
    const [n] = await notifications(tch.user.id, 'PAYOUT_REQUESTED');
    expect(n?.params).toMatchObject({ amount: '70,000' });
  });

  it('зэрэг 5 хүсэлт → яг нэг амжилттай', async () => {
    const tch = await teacher('teacher@example.mn', { balance: 90_000 });
    const results = await Promise.all(Array.from({ length: 5 }, () => requestPayout(tch.agent)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.code).toBe('PAYOUT_ALREADY_OPEN');
    expect(await t.prisma.payout.count()).toBe(1);
  });

  it('DB түвшинд: нэг багшид хоёр дахь нээлттэй хүсэлт оруулах боломжгүй', async () => {
    const tch = await teacher('teacher@example.mn', { balance: 90_000 });
    await requestPayout(tch.agent).expect(201);
    await expect(
      t.prisma.payout.create({ data: { teacherId: tch.user.id, amountMnt: 1, ...BANK } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('хүсэлтийн дараа данс солигдсон ч хүсэлт гаргах үеийн данс хадгалагдана', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 60_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;
    await tch.agent.put('/teacher/bank-account').send({ ...BANK, accountNumber: '9999888877' }).expect(200);
    const q = (await a.agent.get('/admin/payouts').expect(200)).body.items[0];
    expect(q).toMatchObject({ id: p.id, accountNumber: BANK.accountNumber });
  });
});

describe('Админ: "төлсөн" ба татгалзах', () => {
  it('төлсөн → ledger-т PAYOUT (−дүн) бичилт, үлдэгдэл зөв, audit, мэдэгдэл', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;
    await earn(tch.user.id, 5_000); // хүсэлтийн дараах орлого

    const list = (await a.agent.get('/admin/payouts?status=REQUESTED').expect(200)).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: p.id,
      amountMnt: 70_000,
      teacherBalanceMnt: 75_000,
      onHold: false,
      teacher: { id: tch.user.id, email: 'teacher@example.mn' },
    });

    const paid = (await a.agent.post(`/admin/payouts/${p.id}/paid`).send({ transferRef: 'KHAN-TX-123' }).expect(200)).body;
    expect(paid).toMatchObject({ status: 'PAID', transferRef: 'KHAN-TX-123', processedBy: { id: a.user.id } });

    const entries = await t.prisma.teacherEarningEntry.findMany({ where: { type: 'PAYOUT' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ teacherId: tch.user.id, amountMnt: -70_000, refType: 'payout', refId: p.id, actorId: a.user.id });
    expect(await t.prisma.payout.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ earningEntryId: entries[0]!.id });

    expect(await ledger(tch.user.id)).toBe(5_000);
    expect(await view(tch.agent)).toMatchObject({
      balanceMnt: 5_000,
      lockedMnt: 0,
      availableMnt: 5_000,
      blockReason: 'BELOW_MINIMUM',
      openPayout: null,
      items: [{ id: p.id, status: 'PAID' }],
    });
    // Орлогын ledger-т (GET /teacher/earnings) PAYOUT мөр
    const e = (await tch.agent.get('/teacher/earnings').expect(200)).body;
    expect(e.balanceMnt).toBe(5_000);
    expect(e.items.find((i: { type: string }) => i.type === 'PAYOUT')).toMatchObject({ amountMnt: -70_000 });

    expect(await t.prisma.auditLog.findFirst({ where: { action: 'payout.paid', targetId: p.id } })).toMatchObject({ actorId: a.user.id });
    const [n] = await notifications(tch.user.id, 'PAYOUT_PAID');
    expect(n?.params).toMatchObject({ amount: '70,000', account: '****3456' });

    expect((await a.agent.get('/admin/payouts?status=REQUESTED').expect(200)).body.items).toHaveLength(0);
    expect((await a.agent.get('/admin/payouts?status=PAID').expect(200)).body.items).toHaveLength(1);
  });

  it('давхар төлөлтгүй: "төлсөн"-ийг дахин дарвал idempotent, зэрэг 5 дуудлага → нэг л PAYOUT бичилт', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;

    const results = await Promise.all(Array.from({ length: 5 }, () => a.agent.post(`/admin/payouts/${p.id}/paid`).send({})));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    for (const r of results) expect(r.body.status).toBe('PAID');
    await a.agent.post(`/admin/payouts/${p.id}/paid`).send({}).expect(200);

    expect(await t.prisma.teacherEarningEntry.count({ where: { type: 'PAYOUT' } })).toBe(1);
    expect(await ledger(tch.user.id)).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'payout.paid' } })).toBe(1);
    expect(await notifications(tch.user.id, 'PAYOUT_PAID')).toHaveLength(1);

    // Төлсөн хүсэлтийг татгалзах боломжгүй
    expect((await a.agent.post(`/admin/payouts/${p.id}/reject`).send({ reason: 'алдаа' }).expect(409)).body.code).toBe(
      'PAYOUT_NOT_OPEN',
    );
  });

  it('DB түвшинд: нэг хүсэлтэд хоёр дахь PAYOUT бичилт оруулах боломжгүй', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;
    await a.agent.post(`/admin/payouts/${p.id}/paid`).send({}).expect(200);
    await expect(
      t.prisma.$transaction((tx) =>
        earnings.append(tx, { teacherId: tch.user.id, type: 'PAYOUT', amountMnt: -70_000, refType: 'payout', refId: p.id }),
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
    // PAYOUT нь заавал сөрөг, хүсэлттэй холбоотой
    await expect(
      t.prisma.teacherEarningEntry.create({ data: { teacherId: tch.user.id, type: 'PAYOUT', amountMnt: 10 } }),
    ).rejects.toThrow();
  });

  it('татгалзах → ledger-т бичилтгүй, түгжээ чөлөөлөгдөж дахин хүсэх боломжтой; шалтгаан заавал', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;

    await a.agent.post(`/admin/payouts/${p.id}/reject`).send({ reason: ' ' }).expect(400);
    const rejected = (await a.agent.post(`/admin/payouts/${p.id}/reject`).send({ reason: 'Дансны нэр таарахгүй' }).expect(200)).body;
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectReason: 'Дансны нэр таарахгүй' });
    await a.agent.post(`/admin/payouts/${p.id}/reject`).send({ reason: 'дахин' }).expect(200); // idempotent

    expect(await t.prisma.teacherEarningEntry.count({ where: { type: 'PAYOUT' } })).toBe(0);
    expect(await view(tch.agent)).toMatchObject({ balanceMnt: 70_000, lockedMnt: 0, availableMnt: 70_000, blockReason: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'payout.reject', targetId: p.id } })).toBe(1);
    const [n] = await notifications(tch.user.id, 'PAYOUT_REJECTED');
    expect(n?.params).toMatchObject({ reason: 'Дансны нэр таарахгүй' });

    // Татгалзсан хүсэлтийг төлөх боломжгүй
    expect((await a.agent.post(`/admin/payouts/${p.id}/paid`).send({}).expect(409)).body.code).toBe('PAYOUT_NOT_OPEN');
    // Шинэ хүсэлт
    expect((await requestPayout(tch.agent).expect(201)).body.amountMnt).toBe(70_000);
  });

  it('үлдэгдэл хүсэлтийн дүнгээс бага болсон бол (админы засвар) төлсөн гэж тэмдэглэхгүй', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;
    await earn(tch.user.id, -30_000);
    expect((await a.agent.post(`/admin/payouts/${p.id}/paid`).send({}).expect(409)).body.code).toBe('PAYOUT_EXCEEDS_BALANCE');
    expect(await t.prisma.teacherEarningEntry.count({ where: { type: 'PAYOUT' } })).toBe(0);
  });

  it('байхгүй хүсэлт → 404', async () => {
    const a = await admin();
    await a.agent.post('/admin/payouts/00000000-0000-4000-8000-000000000000/paid').send({}).expect(404);
  });
});

describe('Hold', () => {
  it('hold-той багш хүсэлт гаргахгүй; нээлттэй хүсэлтийг төлөхгүй; цуцалбал хэвийн', async () => {
    const a = await admin();
    const tch = await teacher('teacher@example.mn', { balance: 70_000 });
    const p = (await requestPayout(tch.agent).expect(201)).body;

    await a.agent.put(`/admin/payouts/holds/${tch.user.id}`).send({ reason: 'Сэжигтэй борлуулалт' }).expect(204);
    expect((await a.agent.get('/admin/payouts').expect(200)).body.items[0]).toMatchObject({ id: p.id, onHold: true });
    expect((await a.agent.post(`/admin/payouts/${p.id}/paid`).send({}).expect(409)).body.code).toBe('PAYOUT_ON_HOLD');
    expect(await t.prisma.teacherEarningEntry.count({ where: { type: 'PAYOUT' } })).toBe(0);

    // Hold-той үед ч татгалзаж болно; дараа нь шинэ хүсэлт гаргахгүй
    await a.agent.post(`/admin/payouts/${p.id}/reject`).send({ reason: 'Шалгаж байна' }).expect(200);
    expect(await view(tch.agent)).toMatchObject({ onHold: true, blockReason: 'ON_HOLD' });
    expect((await requestPayout(tch.agent).expect(403)).body.code).toBe('PAYOUT_ON_HOLD');

    const holds = (await a.agent.get('/admin/payouts/holds').expect(200)).body;
    expect(holds).toEqual([
      expect.objectContaining({ teacher: expect.objectContaining({ id: tch.user.id }), reason: 'Сэжигтэй борлуулалт', createdBy: { id: a.user.id, name: null } }),
    ]);

    await a.agent.delete(`/admin/payouts/holds/${tch.user.id}`).expect(204);
    await a.agent.delete(`/admin/payouts/holds/${tch.user.id}`).expect(204); // idempotent
    const p2 = (await requestPayout(tch.agent).expect(201)).body;
    await a.agent.post(`/admin/payouts/${p2.id}/paid`).send({}).expect(200);
    expect(await ledger(tch.user.id)).toBe(0);

    const actions = (await t.prisma.auditLog.findMany({ where: { action: { in: ['payout.hold', 'payout.release'] } } })).map(
      (r) => r.action,
    );
    expect(actions.sort()).toEqual(['payout.hold', 'payout.release']);
  });

  it('байхгүй хэрэглэгчид hold → 404; шалтгаан заавал', async () => {
    const a = await admin();
    await a.agent.put('/admin/payouts/holds/00000000-0000-4000-8000-000000000000').send({ reason: 'x' }).expect(404);
    const tch = await teacher();
    await a.agent.put(`/admin/payouts/holds/${tch.user.id}`).send({}).expect(400);
  });
});

describe('CSV export', () => {
  it('нээлттэй хүсэлтүүдийн банкны мэдээлэл, formula injection-гүй, audit-тай', async () => {
    const a = await admin();
    const t1 = await teacher('t1@example.mn', { balance: 60_000 });
    const t2 = await teacher('t2@example.mn', { balance: 80_000, bank: false });
    await t2.agent.put('/teacher/bank-account').send({ bank: 'GOLOMT', accountNumber: '1100223344', holderName: '=HYPERLINK("x")' }).expect(200);
    const p1 = (await requestPayout(t1.agent).expect(201)).body;
    const p2 = (await requestPayout(t2.agent).expect(201)).body;

    const res = await a.agent.get('/admin/payouts/export.csv').expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toContain('payouts.csv');
    const text: string = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Дансны дугаар');
    expect(lines[1]).toContain(p1.id);
    expect(lines[1]).toContain('KHAN,5000123456,Бат-Эрдэнэ Д.,60000');
    expect(lines[2]).toContain(p2.id);
    expect(lines[2]).toContain(`GOLOMT,1100223344,"'=HYPERLINK(""x"")",80000`);

    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'payout.export' } });
    expect(audit).toMatchObject({ actorId: a.user.id, after: expect.objectContaining({ count: 2, totalMnt: 140_000 }) });
  });
});

describe('Эрх', () => {
  it('зочин 401, суралцагч 403 (багшийн), багш 403 (админы)', async () => {
    await t.http().get('/teacher/payouts').expect(401);
    await t.http().get('/admin/payouts').expect(401);
    const u = await loginByEmail(t, 'learner@example.mn');
    await u.agent.get('/teacher/payouts').expect(403);
    await u.agent.post('/teacher/payouts').expect(403);
    const tch = await teacher();
    for (const [m, path] of [
      ['get', '/admin/payouts'],
      ['get', '/admin/payouts/export.csv'],
      ['get', '/admin/payouts/holds'],
      ['put', `/admin/payouts/holds/${tch.user.id}`],
      ['delete', `/admin/payouts/holds/${tch.user.id}`],
      ['post', '/admin/payouts/00000000-0000-4000-8000-000000000000/paid'],
      ['post', '/admin/payouts/00000000-0000-4000-8000-000000000000/reject'],
    ] as const) {
      await tch.agent[m](path).send({ reason: 'x' }).expect(403);
    }
  });

  it('багш зөвхөн өөрийн хүсэлтүүдийг харна', async () => {
    const t1 = await teacher('t1@example.mn', { balance: 60_000 });
    const t2 = await teacher('t2@example.mn');
    await requestPayout(t1.agent).expect(201);
    expect((await view(t2.agent)).items).toHaveLength(0);
  });
});
