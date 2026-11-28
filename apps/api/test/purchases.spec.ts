import type { CourseStatus, LessonReviewStatus } from '@lms/db';
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

// ---------------------------------------------------------------------------
// Fixture-ууд: курс DB-д шууд (зохиох/шалгах урсгал catalog.spec.ts-д), кредит CreditsService-ээр.
// Худалдан авалт, эрх, орлогын шалгалт бүгд HTTP-ээр.
// ---------------------------------------------------------------------------

let seq = 0;

async function learner(email = 'learner@example.mn', balance = 0, isTest = false) {
  const s = await loginByEmail(t, email);
  if (balance > 0) await grant(s.user.id, balance, isTest);
  return s;
}

async function grant(userId: string, amount: number, isTest = false) {
  await t.prisma.$transaction(
    (tx) => credits.grant(tx, { userId, credits: amount, source: 'ADMIN_ADJUST', isTest }),
    CREDIT_TX_OPTIONS,
  );
}

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

interface LessonSpec {
  price?: number;
  preview?: boolean;
  status?: LessonReviewStatus;
  archived?: boolean;
}

async function course(opts: {
  teacherId: string;
  price?: number | null;
  status?: CourseStatus;
  lessons?: LessonSpec[];
}) {
  const status = opts.status ?? 'PUBLISHED';
  const row = await t.prisma.course.create({
    data: {
      teacherId: opts.teacherId,
      title: `Курс ${++seq}`,
      priceCredits: opts.price === undefined ? 12 : opts.price,
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const lessonIds: string[] = [];
  for (const [i, l] of (opts.lessons ?? [{}, {}, {}]).entries()) {
    lessonIds.push(await addLesson(row.id, row.sections[0]!.id, i, l));
  }
  return { id: row.id, sectionId: row.sections[0]!.id, lessonIds };
}

async function addLesson(courseId: string, sectionId: string, position: number, l: LessonSpec = {}) {
  const lesson = await t.prisma.lesson.create({
    data: {
      courseId,
      sectionId,
      title: `Хичээл ${position + 1}`,
      type: 'TEXT',
      position,
      priceCredits: l.price ?? 5,
      isFreePreview: l.preview ?? false,
      reviewStatus: l.status ?? 'APPROVED',
      archivedAt: l.archived ? new Date() : null,
      content: { markdown: `Нууц агуулга ${position + 1}` },
    },
  });
  return lesson.id;
}

const confirm = (expectedCredits: number) => ({ confirmNoRefund: true, expectedCredits });
const buyLesson = (a: Agent, id: string, expected: number) => a.post(`/purchases/lessons/${id}`).send(confirm(expected));
const buyCourse = (a: Agent, id: string, expected: number) => a.post(`/purchases/courses/${id}`).send(confirm(expected));
const balanceOf = async (a: Agent): Promise<number> => (await a.get('/credits').expect(200)).body.balance;

async function nothingWritten() {
  expect(await t.prisma.purchase.count()).toBe(0);
  expect(await t.prisma.entitlement.count()).toBe(0);
  expect(await t.prisma.courseEntitlement.count()).toBe(0);
  expect(await t.prisma.teacherEarningEntry.count()).toBe(0);
  expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'SPEND' } })).toBe(0);
}

// ---------------------------------------------------------------------------

describe('Lesson худалдан авалт', () => {
  it('кредит хасагдаж, эрх үүсч, контент нээгдэнэ; багшийн орлого 60%; баримт мэдэгдэл', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 20);

    await u.agent.get(`/catalog/lessons/${c.lessonIds[0]}`).expect(403);
    const res = (await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201)).body;
    expect(res.balance).toBe(15);
    expect(res.purchase).toMatchObject({ kind: 'LESSON', credits: 5, listCredits: 5, lessonCount: 1, isTest: false });
    expect(res.purchase.lesson.id).toBe(c.lessonIds[0]);
    expect(await balanceOf(u.agent)).toBe(15);

    const lesson = (await u.agent.get(`/catalog/lessons/${c.lessonIds[0]}`).expect(200)).body;
    expect(lesson.access).toBe('OWNED');
    expect(lesson.content.markdown).toBe('Нууц агуулга 1');
    await u.agent.get(`/catalog/lessons/${c.lessonIds[1]}`).expect(403);

    const detail = (await u.agent.get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(detail.viewer).toEqual({ ownsCourse: false, ownedLessonIds: [c.lessonIds[0]], canViewAll: false, orgAccess: false, isTeacher: false });

    const history = (await u.agent.get('/credits/history').expect(200)).body.items;
    expect(history[0]).toMatchObject({ type: 'SPEND', amount: -5, refType: 'lesson_purchase', refId: res.purchase.id });

    const purchase = await t.prisma.purchase.findUniqueOrThrow({ where: { id: res.purchase.id } });
    expect(purchase).toMatchObject({
      teacherId: tch.user.id,
      creditPriceMnt: 1000,
      commissionPercent: 40,
      attribution: 'PLATFORM',
      referrerId: null,
      creditEntryId: history[0].id,
    });

    const earnings = (await tch.agent.get('/teacher/earnings').expect(200)).body;
    expect(earnings).toMatchObject({ balanceMnt: 3000, totalEarnedMnt: 3000, testBalanceMnt: 0 });
    expect(earnings.items).toEqual([
      expect.objectContaining({
        type: 'SALE_EARNING',
        amountMnt: 3000,
        credits: 5,
        creditPriceMnt: 1000,
        commissionPercent: 40,
        grossMnt: 5000,
        attribution: 'PLATFORM',
        sale: { kind: 'LESSON', courseTitle: expect.any(String), lessonTitle: 'Хичээл 1' },
      }),
    ]);

    const mine = (await u.agent.get('/purchases').expect(200)).body;
    expect(mine.items.map((p: { id: string }) => p.id)).toEqual([res.purchase.id]);

    expect(await t.prisma.notification.count({ where: { userId: u.user.id, type: 'PURCHASE_LESSON' } })).toBe(1);
    await t.queue.drain();
    const mail = t.email.last('learner@example.mn');
    expect(mail?.subject).toContain('Хичээл 1');
    expect(mail?.text).toContain('буцаагдахгүй');
  });

  it('аль хэдийн эзэмшсэн lesson-ыг дахин авахгүй (409), кредит хасагдахгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 20);
    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);
    expect((await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(409)).body.code).toBe('ALREADY_OWNED');
    expect(await balanceOf(u.agent)).toBe(15);
    expect(await t.prisma.purchase.count()).toBe(1);
  });

  it('өөрийн курс, нийтлэгдээгүй курс, шалгагдаагүй / архивласан lesson-ыг авах боломжгүй', async () => {
    const tch = await teacher();
    const own = await course({ teacherId: tch.user.id });
    await grant(tch.user.id, 50);
    expect((await buyLesson(tch.agent, own.lessonIds[0]!, 5).expect(403)).body.code).toBe('OWN_COURSE');
    expect((await buyCourse(tch.agent, own.id, 12).expect(403)).body.code).toBe('OWN_COURSE');

    const draft = await course({ teacherId: tch.user.id, status: 'IN_REVIEW', lessons: [{ status: 'IN_REVIEW' }] });
    const mixed = await course({
      teacherId: tch.user.id,
      lessons: [{}, { status: 'IN_REVIEW' }, { status: 'REJECTED' }, { status: 'DRAFT' }, { archived: true }],
    });
    const noPrice = await course({ teacherId: tch.user.id, price: null });
    const u = await learner('learner@example.mn', 50);

    expect((await buyLesson(u.agent, draft.lessonIds[0]!, 5).expect(404)).body.code).toBe('NOT_FOUND');
    await buyCourse(u.agent, draft.id, 12).expect(404);
    for (const id of mixed.lessonIds.slice(1)) await buyLesson(u.agent, id, 5).expect(404);
    expect((await buyCourse(u.agent, noPrice.id, 0).expect(409)).body.code).toBe('COURSE_NOT_FOR_SALE');
    await buyLesson(u.agent, '00000000-0000-4000-8000-000000000000', 5).expect(404);

    await nothingWritten();
    expect(await balanceOf(u.agent)).toBe(50);
  });

  it('кредит хүрэлцэхгүй → 409 INSUFFICIENT_CREDITS, юу ч бичигдэхгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 3);

    expect((await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(409)).body.code).toBe('INSUFFICIENT_CREDITS');
    expect((await buyCourse(u.agent, c.id, 12).expect(409)).body.code).toBe('INSUFFICIENT_CREDITS');
    await nothingWritten();
    expect(await balanceOf(u.agent)).toBe(3);
    await u.agent.get(`/catalog/lessons/${c.lessonIds[0]}`).expect(403);
    expect(await t.prisma.notification.count({ where: { type: { startsWith: 'PURCHASE_' } } })).toBe(0);
  });

  it('буцаалтгүйг баталгаажуулаагүй → 400; харсан үнэ өөрчлөгдсөн → 409 PRICE_CHANGED; юу ч бичигдэхгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 50);

    const lessonUrl = `/purchases/lessons/${c.lessonIds[0]}`;
    expect((await u.agent.post(lessonUrl).send({ expectedCredits: 5 }).expect(400)).body.code).toBe('NO_REFUND_NOT_CONFIRMED');
    await u.agent.post(lessonUrl).send({ confirmNoRefund: false, expectedCredits: 5 }).expect(400);
    await u.agent.post(lessonUrl).send({ confirmNoRefund: true }).expect(400);
    await u.agent.post(`/purchases/courses/${c.id}`).send({ expectedCredits: 12 }).expect(400);

    const changed = (await buyLesson(u.agent, c.lessonIds[0]!, 4).expect(409)).body;
    expect(changed.code).toBe('PRICE_CHANGED');
    expect(changed.message).toContain('5');
    expect((await buyCourse(u.agent, c.id, 15).expect(409)).body.code).toBe('PRICE_CHANGED');
    await nothingWritten();
    expect(await balanceOf(u.agent)).toBe(50);
  });

  it('нэвтрээгүй бол 401', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    await t.http().post(`/purchases/lessons/${c.lessonIds[0]}`).send(confirm(5)).expect(401);
    await t.http().get('/purchases').expect(401);
    await t.http().get('/teacher/earnings').expect(401);
  });
});

describe('Курс бүтнээр', () => {
  it('өмнө авсан lesson-ы кредит курсийн үнээс хасагдана; дараа зөвшөөрөгдөх lesson ч нээгдэнэ', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id, price: 12 });
    const u = await learner('learner@example.mn', 30);

    // Зочинд жагсаалтын үнэ, viewer null
    const anon = (await t.http().get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(anon.pricing).toMatchObject({ listCredits: 12, lessonsTotalCredits: 15, alreadySpentCredits: 0, payableCredits: 12 });
    expect(anon.viewer).toBeNull();

    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);
    const before = (await u.agent.get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(before.pricing).toMatchObject({ alreadySpentCredits: 5, payableCredits: 7 });

    const res = (await buyCourse(u.agent, c.id, 7).expect(201)).body;
    expect(res.purchase).toMatchObject({ kind: 'COURSE', lesson: null, listCredits: 12, credits: 7, lessonCount: 2 });
    expect(res.balance).toBe(30 - 5 - 7);

    const after = (await u.agent.get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(after.pricing.payableCredits).toBe(0);
    expect(after.viewer.ownsCourse).toBe(true);
    expect([...after.viewer.ownedLessonIds].sort()).toEqual([...c.lessonIds].sort());
    for (const id of c.lessonIds) await u.agent.get(`/catalog/lessons/${id}`).expect(200);
    expect((await buyLesson(u.agent, c.lessonIds[1]!, 5).expect(409)).body.code).toBe('ALREADY_OWNED');
    expect((await buyCourse(u.agent, c.id, 0).expect(409)).body.code).toBe('ALREADY_OWNED');

    // Шинэ lesson дараа нь зөвшөөрөгдвөл бүтэн курс эзэмшигчид нээлттэй
    const added = await addLesson(c.id, c.sectionId, 3, { price: 8 });
    const lesson = (await u.agent.get(`/catalog/lessons/${added}`).expect(200)).body;
    expect(lesson.access).toBe('OWNED');
    expect((await buyLesson(u.agent, added, 8).expect(409)).body.code).toBe('ALREADY_OWNED');

    const earnings = (await tch.agent.get('/teacher/earnings').expect(200)).body;
    expect(earnings.balanceMnt).toBe(3000 + 4200);
    expect(earnings.items.map((e: { amountMnt: number }) => e.amountMnt)).toEqual([4200, 3000]);

    expect(await t.prisma.notification.count({ where: { type: 'PURCHASE_COURSE' } })).toBe(1);
  });

  it('өмнө төлсөн нь курсийн үнээс их бол 0 үнээр дуусгана: эрх үүсч, кредит, орлого хөдлөхгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id, price: 10, lessons: [{ price: 6 }, { price: 6 }] });
    const u = await learner('learner@example.mn', 12);
    await buyLesson(u.agent, c.lessonIds[0]!, 6).expect(201);
    await buyLesson(u.agent, c.lessonIds[1]!, 6).expect(201);

    const detail = (await u.agent.get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(detail.pricing).toMatchObject({ alreadySpentCredits: 12, payableCredits: 0 });

    const res = (await buyCourse(u.agent, c.id, 0).expect(201)).body;
    expect(res.purchase).toMatchObject({ kind: 'COURSE', credits: 0, listCredits: 10, lessonCount: 0 });
    expect(res.balance).toBe(0);
    expect(await t.prisma.courseEntitlement.count()).toBe(1);
    expect(await t.prisma.purchase.findUniqueOrThrow({ where: { id: res.purchase.id } })).toMatchObject({ creditEntryId: null });
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'SPEND' } })).toBe(2);
    expect(await t.prisma.teacherEarningEntry.count()).toBe(2);
  });
});

describe('Зэрэг (concurrent) худалдан авалт', () => {
  it('нэг lesson-ыг зэрэг 5 удаа → яг нэг амжилттай, кредит нэг л удаа хасагдана', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 50);

    const results = await Promise.all(Array.from({ length: 5 }, () => buyLesson(u.agent, c.lessonIds[0]!, 5)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.code).toBe('ALREADY_OWNED');

    expect(await balanceOf(u.agent)).toBe(45);
    expect(await t.prisma.purchase.count()).toBe(1);
    expect(await t.prisma.entitlement.count()).toBe(1);
    expect(await t.prisma.teacherEarningEntry.count()).toBe(1);
    expect(await t.prisma.creditLedgerEntry.count({ where: { type: 'SPEND' } })).toBe(1);
  });

  it('зэрэг өөр өөр худалдан авалт (lesson-ууд + курс) хэзээ ч балансаас хэтрэхгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id, price: 12, lessons: [{}, {}, {}, {}, {}] });
    const u = await learner('learner@example.mn', 10);

    const results = await Promise.all(c.lessonIds.map((id) => buyLesson(u.agent, id, 5)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    for (const r of results.filter((x) => x.status !== 201)) expect(r.body.code).toBe('INSUFFICIENT_CREDITS');
    expect(await balanceOf(u.agent)).toBe(0);
    expect(await t.prisma.entitlement.count()).toBe(2);

    // Курс + lesson зэрэг: курсийн үнэ 12 − 10 = 2, lesson 5; баланс 6 → аль нэг нь эсвэл хоёулаа (дараалалаас хамаарч) — хэтрэхгүй
    await grant(u.user.id, 6);
    const owned = new Set((await t.prisma.entitlement.findMany()).map((e) => e.lessonId));
    const free = c.lessonIds.find((id) => !owned.has(id))!;
    const mixed = await Promise.all([buyCourse(u.agent, c.id, 2), buyLesson(u.agent, free, 5)]);
    const spent = (await t.prisma.purchase.aggregate({ _sum: { credits: true } }))._sum.credits ?? 0;
    expect(spent).toBeLessThanOrEqual(16);
    expect(await balanceOf(u.agent)).toBe(16 - spent);
    expect(mixed.some((r) => r.status === 201)).toBe(true);
    for (const r of mixed.filter((x) => x.status !== 201)) expect(['PRICE_CHANGED', 'INSUFFICIENT_CREDITS', 'ALREADY_OWNED']).toContain(r.body.code);
  });
});

describe('Шимтгэл, үнэ: худалдах мөчийнхөөр хадгалагдана', () => {
  it('орлого = floor(кредит × ₮ үнэ × (100 − шимтгэл%) / 100); тохиргоо өөрчлөгдсөн ч хуучин бичилт хэвээр', async () => {
    const a = await admin();
    await a.agent.put('/admin/settings/creditPriceMnt').send({ value: 1234 }).expect(200);
    await a.agent.put('/admin/settings/commissionPlatformPercent').send({ value: 33 }).expect(200);

    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id, lessons: [{ price: 7 }, { price: 3 }] });
    const u = await learner('learner@example.mn', 20);
    const first = (await buyLesson(u.agent, c.lessonIds[0]!, 7).expect(201)).body.purchase;

    // 7 × 1234 = 8638; 8638 × 67 / 100 = 5787.46 → 5787 (бутархай платформд)
    const e1 = await t.prisma.teacherEarningEntry.findFirstOrThrow({ where: { purchaseId: first.id } });
    expect(e1).toMatchObject({ amountMnt: 5787, grossMnt: 8638, credits: 7, creditPriceMnt: 1234, commissionPercent: 33 });

    await a.agent.put('/admin/settings/creditPriceMnt').send({ value: 2000 }).expect(200);
    await a.agent.put('/admin/settings/commissionPlatformPercent').send({ value: 50 }).expect(200);
    const second = (await buyLesson(u.agent, c.lessonIds[1]!, 3).expect(201)).body.purchase;

    expect(await t.prisma.teacherEarningEntry.findFirstOrThrow({ where: { purchaseId: first.id } })).toEqual(e1);
    expect(await t.prisma.purchase.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      creditPriceMnt: 1234,
      commissionPercent: 33,
    });
    const e2 = await t.prisma.teacherEarningEntry.findFirstOrThrow({ where: { purchaseId: second.id } });
    expect(e2).toMatchObject({ amountMnt: 3000, grossMnt: 6000, creditPriceMnt: 2000, commissionPercent: 50 });
    expect((await tch.agent.get('/teacher/earnings').expect(200)).body.balanceMnt).toBe(5787 + 3000);
  });

  it('100% шимтгэл → орлогын бичилт үүсэхгүй (0₮), худалдан авалт амжилттай', async () => {
    const a = await admin();
    await a.agent.put('/admin/settings/commissionPlatformPercent').send({ value: 100 }).expect(200);
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 5);
    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);
    expect(await t.prisma.purchase.findFirstOrThrow()).toMatchObject({ commissionPercent: 100 });
    expect(await t.prisma.teacherEarningEntry.count()).toBe(0);
  });

  it('тест lot-оос зарцуулсан → purchase, орлого is_test; payout үлдэгдэлд орохгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 5, true);
    const res = (await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201)).body;
    expect(res.purchase.isTest).toBe(true);
    expect(await t.prisma.teacherEarningEntry.findFirstOrThrow()).toMatchObject({ isTest: true, amountMnt: 3000 });
    const earnings = (await tch.agent.get('/teacher/earnings').expect(200)).body;
    expect(earnings).toMatchObject({ balanceMnt: 0, totalEarnedMnt: 0, testBalanceMnt: 3000 });
    expect(earnings.items[0].isTest).toBe(true);
  });
});

describe('Багшид "зарагдлаа" мэдэгдэл (TEACHER_SALE)', () => {
  const saleNotes = (userId: string) => t.prisma.notification.findMany({ where: { userId, type: 'TEACHER_SALE' } });

  it('багшид in-app + имэйл (орлого, нэр нууцлагдсан); худалдан авагчид очихгүй; курсийн худалдаанд ч', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 20);
    await t.queue.drain();
    t.email.sent.length = 0;

    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);
    const notes = await saleNotes(tch.user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ link: '/teacher/earnings' });
    expect(notes[0]!.params).toMatchObject({ amount: 3000, testNote: '' });
    expect(await saleNotes(u.user.id)).toHaveLength(0);

    await t.queue.drain();
    const mail = t.email.last('teacher@example.mn');
    expect(mail?.subject).toContain('+3000₮');
    expect(mail?.text).toContain('Нэг сурагч');
    expect(mail?.text).not.toContain('learner@example.mn');
    expect(t.email.sent.filter((m) => m.subject.includes('зарагдлаа'))).toHaveLength(1);

    const list = (await tch.agent.get('/notifications').expect(200)).body.items;
    expect(list.find((n: { type: string }) => n.type === 'TEACHER_SALE').body).toContain('3000₮');

    const c2 = await course({ teacherId: tch.user.id, price: 7 });
    await grant(u.user.id, 7);
    await buyCourse(u.agent, c2.id, 7).expect(201);
    expect(await saleNotes(tch.user.id)).toHaveLength(2);
  });

  it('TEACHER_SALES имэйл унтарсан бол имэйл явахгүй, in-app хэвээр', async () => {
    const tch = await teacher();
    await tch.agent.put('/notifications/preferences/TEACHER_SALES').send({ emailEnabled: false }).expect(200);
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 5);
    await t.queue.drain();
    t.email.sent.length = 0;

    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);
    expect(await saleNotes(tch.user.id)).toHaveLength(1);
    await t.queue.drain();
    expect(t.email.sent.filter((m) => m.subject.includes('зарагдлаа'))).toHaveLength(0);
  });

  it('тест кредитээр авсан бол тэмдэглэгдэнэ; 0₮ орлого (100% шимтгэл) / үнэгүйд мэдэгдэл үүсэхгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 5, true);
    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);
    const [note] = await saleNotes(tch.user.id);
    expect(note!.params).toMatchObject({ amount: 3000, testNote: expect.stringContaining('Тест') });

    const a = await admin();
    await a.agent.put('/admin/settings/commissionPlatformPercent').send({ value: 100 }).expect(200);
    const u2 = await learner('l2@example.mn', 5);
    await buyLesson(u2.agent, c.lessonIds[0]!, 5).expect(201);
    expect(await saleNotes(tch.user.id)).toHaveLength(1);
  });
});

describe('Эрхийн шалгалт (entitlement, role)', () => {
  it('зочин / эрхгүй 403, эзэмшигч, багш, админ 200; preview бүгдэд; эрхгүй бол контент огт гарахгүй', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id, lessons: [{ preview: true }, {}] });
    const [preview, paid] = c.lessonIds as [string, string];
    const owner = await learner('owner@example.mn', 10);
    await buyLesson(owner.agent, paid, 5).expect(201);
    const other = await learner('other@example.mn', 10);
    const a = await admin();

    const locked = (await t.http().get(`/catalog/lessons/${paid}`).expect(403)).body;
    expect(locked.code).toBe('LESSON_LOCKED');
    expect(JSON.stringify(locked)).not.toContain('Нууц');
    await other.agent.get(`/catalog/lessons/${paid}`).expect(403);
    expect((await owner.agent.get(`/catalog/lessons/${paid}`).expect(200)).body.access).toBe('OWNED');
    expect((await tch.agent.get(`/catalog/lessons/${paid}`).expect(200)).body.access).toBe('TEACHER');
    expect((await a.agent.get(`/catalog/lessons/${paid}`).expect(200)).body.access).toBe('ADMIN');
    expect((await t.http().get(`/catalog/lessons/${preview}`).expect(200)).body.access).toBe('PREVIEW');
    expect((await other.agent.get(`/catalog/lessons/${preview}`).expect(200)).body.access).toBe('PREVIEW');

    // Хүчингүй cookie → зочин (401 биш)
    await t.http().get(`/catalog/lessons/${preview}`).set('Cookie', 'access_token=garbage').expect(200);
    await t.http().get(`/catalog/courses/${c.id}`).set('Cookie', 'access_token=garbage').expect(200);

    const tView = (await tch.agent.get(`/catalog/courses/${c.id}`).expect(200)).body.viewer;
    expect(tView).toMatchObject({ canViewAll: true, isTeacher: true, ownsCourse: false });
    expect((await a.agent.get(`/catalog/courses/${c.id}`).expect(200)).body.viewer).toMatchObject({ canViewAll: true, isTeacher: false });
  });

  it('архивласан lesson: эзэмшигчид хэвээр, бусдад (preview ч гэсэн) 404', async () => {
    const tch = await teacher();
    const c = await course({ teacherId: tch.user.id, lessons: [{}, { preview: true }] });
    const owner = await learner('owner@example.mn', 10);
    await buyLesson(owner.agent, c.lessonIds[0]!, 5).expect(201);
    await t.prisma.lesson.updateMany({ where: { id: { in: c.lessonIds } }, data: { archivedAt: new Date() } });

    expect((await owner.agent.get(`/catalog/lessons/${c.lessonIds[0]}`).expect(200)).body.access).toBe('OWNED');
    await t.http().get(`/catalog/lessons/${c.lessonIds[0]}`).expect(404);
    await t.http().get(`/catalog/lessons/${c.lessonIds[1]}`).expect(404);
    await owner.agent.get(`/catalog/lessons/${c.lessonIds[1]}`).expect(404);
    await tch.agent.get(`/catalog/lessons/${c.lessonIds[0]}`).expect(200);
  });

  it('багшийн орлого зөвхөн TEACHER-т, зөвхөн өөрийнх', async () => {
    const tch = await teacher();
    const other = await teacher('other-teacher@example.mn');
    const c = await course({ teacherId: tch.user.id });
    const u = await learner('learner@example.mn', 5);
    await buyLesson(u.agent, c.lessonIds[0]!, 5).expect(201);

    await u.agent.get('/teacher/earnings').expect(403);
    expect((await other.agent.get('/teacher/earnings').expect(200)).body).toMatchObject({ balanceMnt: 0, items: [] });
    expect((await tch.agent.get('/teacher/earnings').expect(200)).body.balanceMnt).toBe(3000);
  });
});
