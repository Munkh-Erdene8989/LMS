import type { PurchaseAttribution } from '@lms/db';
import type { CourseVideoAnalyticsView, TeacherAnalyticsView } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
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
// Fixture-ууд
// ---------------------------------------------------------------------------

async function teacher(email: string) {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

let seq = 0;
async function learner(): Promise<string> {
  return (await t.prisma.user.create({ data: { name: `Суралцагч ${++seq}` } })).id;
}

/** Нийтлэгдсэн курс + lesson-ууд (DB-д шууд) */
async function course(
  teacherId: string,
  lessons: { title: string; type?: 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE'; review?: 'APPROVED' | 'DRAFT'; durationSeconds?: number }[],
  title = 'Курс',
) {
  const c = await t.prisma.course.create({
    data: {
      teacherId,
      title,
      priceCredits: 20,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1', position: 0 } },
    },
    include: { sections: true },
  });
  const ids: string[] = [];
  for (const [i, l] of lessons.entries()) {
    const row = await t.prisma.lesson.create({
      data: {
        courseId: c.id,
        sectionId: c.sections[0]!.id,
        title: l.title,
        type: l.type ?? 'TEXT',
        position: i,
        priceCredits: 5,
        reviewStatus: l.review ?? 'APPROVED',
        content: l.durationSeconds ? { videoId: null, status: 'READY', durationSeconds: l.durationSeconds, error: null } : {},
      },
    });
    ids.push(row.id);
  }
  return { courseId: c.id, lessonIds: ids };
}

/**
 * Худалдан авалт + эрх + SALE_EARNING (PurchasesService-ийн бичдэгтэй ижил хэлбэр), огноог тест тогтооно.
 * Кредитийн ₮ үнэ 1000, шимтгэл: PLATFORM 30%, REFERRAL 10%.
 */
async function sale(opts: {
  teacherId: string;
  userId: string;
  courseId: string;
  lessonId?: string;
  courseLessonIds?: string[];
  credits: number;
  at: string;
  attribution?: PurchaseAttribution;
  isTest?: boolean;
}) {
  const attribution = opts.attribution ?? 'PLATFORM';
  const commission = attribution === 'REFERRAL' ? 10 : 30;
  const createdAt = new Date(opts.at);
  const p = await t.prisma.purchase.create({
    data: {
      userId: opts.userId,
      courseId: opts.courseId,
      lessonId: opts.lessonId ?? null,
      teacherId: opts.teacherId,
      kind: opts.lessonId ? 'LESSON' : 'COURSE',
      listCredits: opts.credits,
      credits: opts.credits,
      creditPriceMnt: 1000,
      commissionPercent: commission,
      attribution,
      referrerId: attribution === 'REFERRAL' ? opts.teacherId : null,
      isTest: opts.isTest ?? false,
      createdAt,
    },
  });
  const lessonIds = opts.lessonId ? [opts.lessonId] : (opts.courseLessonIds ?? []);
  if (lessonIds.length) {
    await t.prisma.entitlement.createMany({
      data: lessonIds.map((lessonId) => ({ userId: opts.userId, lessonId, courseId: opts.courseId, purchaseId: p.id })),
    });
  }
  if (!opts.lessonId) {
    await t.prisma.courseEntitlement.create({ data: { userId: opts.userId, courseId: opts.courseId, purchaseId: p.id } });
  }
  const gross = opts.credits * 1000;
  await t.prisma.teacherEarningEntry.create({
    data: {
      teacherId: opts.teacherId,
      type: 'SALE_EARNING',
      amountMnt: (gross * (100 - commission)) / 100,
      purchaseId: p.id,
      credits: opts.credits,
      creditPriceMnt: 1000,
      commissionPercent: commission,
      grossMnt: gross,
      attribution,
      isTest: opts.isTest ?? false,
      createdAt,
    },
  });
  return p.id;
}

async function progress(userId: string, courseId: string, lessonId: string, watchedPercent: number, completed: boolean) {
  await t.prisma.lessonProgress.create({
    data: { userId, courseId, lessonId, watchedPercent, completedAt: completed ? new Date() : null },
  });
}

const overview = async (a: Agent, qs: string): Promise<TeacherAnalyticsView> =>
  (await a.get(`/teacher/analytics?${qs}`).expect(200)).body;
const video = async (a: Agent, courseId: string, qs = 'from=2026-11-01&to=2026-11-10'): Promise<CourseVideoAnalyticsView> =>
  (await a.get(`/teacher/analytics/courses/${courseId}/video?${qs}`).expect(200)).body;

// ---------------------------------------------------------------------------

describe('Борлуулалт: Улаанбаатарын цагаар өдөр/сараар', () => {
  it('UTC 16:00-ийн хил дээрх худалдан авалтыг UB-ийн зөв өдөр/сард оноож, хүрээнээс гадуурхыг хасна', async () => {
    const a = await teacher('a@example.mn');
    const { courseId, lessonIds } = await course(a.user.id, [{ title: 'L1' }, { title: 'L2' }]);
    const [l1, l2] = lessonIds as [string, string];
    const u1 = await learner();
    const u2 = await learner();
    const base = { teacherId: a.user.id, courseId };
    // UB 11-08 23:59 — хүрээнээс гадуур (11-09-өөс эхэлнэ)
    await sale({ ...base, userId: u1, lessonId: l1, credits: 1, at: '2026-11-08T15:59:00Z' });
    // UB 11-09 00:00
    await sale({ ...base, userId: u2, lessonId: l1, credits: 2, at: '2026-11-08T16:00:00Z' });
    // UB 11-09 23:59:59
    await sale({ ...base, userId: u2, lessonId: l2, credits: 3, at: '2026-11-09T15:59:59Z' });
    // UB 11-10 00:00
    await sale({ ...base, userId: u1, lessonId: l2, credits: 4, at: '2026-11-09T16:00:00Z' });
    // UB 11-11 00:30 — хүрээнээс гадуур
    await sale({ ...base, userId: await learner(), lessonId: l2, credits: 5, at: '2026-11-10T16:30:00Z' });

    const v = await overview(a.agent, 'from=2026-11-09&to=2026-11-10&granularity=day');
    expect(v.range).toEqual({ from: '2026-11-09', to: '2026-11-10', granularity: 'day', timezone: 'Asia/Ulaanbaatar' });
    expect(v.series).toEqual([
      { period: '2026-11-09', sales: 2, credits: 5, grossMnt: 5000, earningMnt: 3500 },
      { period: '2026-11-10', sales: 1, credits: 4, grossMnt: 4000, earningMnt: 2800 },
    ]);
    expect(v.totals).toEqual({ sales: 3, credits: 9, grossMnt: 9000, earningMnt: 6300 });
    // Lesson бүрийн худалдан авалт (хүрээнд)
    expect(v.lessons.map((l) => [l.title, l.sales, l.credits])).toEqual([
      ['L1', 1, 2],
      ['L2', 2, 7],
    ]);
    expect(v.courses).toEqual([
      expect.objectContaining({ courseId, courseSales: 0, lessonSales: 3, credits: 9, earningMnt: 6300 }),
    ]);

    // Сараар: UB 11-01 00:30 (UTC 10-31) → 2026-11; UB 10-31 23:30 → 2026-10; борлуулалтгүй сар 0
    await sale({ ...base, userId: await learner(), lessonId: l1, credits: 10, at: '2026-10-31T16:30:00Z' });
    await sale({ ...base, userId: await learner(), lessonId: l1, credits: 20, at: '2026-10-31T15:30:00Z' });
    const m = await overview(a.agent, 'from=2026-09-15&to=2026-11-20&granularity=month');
    expect(m.range).toMatchObject({ from: '2026-09-01', to: '2026-11-30', granularity: 'month' });
    expect(m.series.map((p) => [p.period, p.sales, p.credits])).toEqual([
      ['2026-09', 0, 0],
      ['2026-10', 1, 20],
      ['2026-11', 6, 25],
    ]);
  });

  it('анхдагч хүрээ: сүүлийн 30 хоног (UB-ийн өнөөдрийг оруулаад); буруу хүрээ → 400', async () => {
    const a = await teacher('a@example.mn');
    const v = await overview(a.agent, '');
    expect(v.series).toHaveLength(30);
    expect(v.range.to).toBe(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
    expect((await a.agent.get('/teacher/analytics?from=2026-11-10&to=2026-11-01').expect(400)).body.code).toBe('INVALID_RANGE');
    expect((await a.agent.get('/teacher/analytics?from=2024-01-01&to=2026-11-01').expect(400)).body.code).toBe('INVALID_RANGE');
    expect((await a.agent.get('/teacher/analytics?from=2026-02-30').expect(400)).body.code).toBe('VALIDATION');
  });
});

describe('Тест гүйлгээ, attribution, эрх', () => {
  it('тест худалдан авалт тоонд орохгүй (тусад нь); referral/платформ задаргаа; үлдэгдэл тест бусаар', async () => {
    const a = await teacher('a@example.mn');
    const { courseId, lessonIds } = await course(a.user.id, [{ title: 'L1' }, { title: 'L2' }]);
    const [l1, l2] = lessonIds as [string, string];
    const base = { teacherId: a.user.id, courseId };
    await sale({ ...base, userId: await learner(), lessonId: l1, credits: 5, at: '2026-11-05T04:00:00Z' });
    await sale({ ...base, userId: await learner(), lessonId: l2, credits: 5, at: '2026-11-05T05:00:00Z', attribution: 'REFERRAL' });
    await sale({
      ...base,
      userId: await learner(),
      credits: 20,
      courseLessonIds: [l1, l2],
      at: '2026-11-06T05:00:00Z',
      attribution: 'REFERRAL',
    });
    await sale({ ...base, userId: await learner(), lessonId: l1, credits: 5, at: '2026-11-06T06:00:00Z', isTest: true });

    const v = await overview(a.agent, 'from=2026-11-01&to=2026-11-10');
    expect(v.totals).toEqual({ sales: 3, credits: 30, grossMnt: 30_000, earningMnt: 3500 + 4500 + 18_000 });
    expect(v.testSales).toEqual({ sales: 1, credits: 5 });
    expect(v.attribution).toEqual({
      PLATFORM: { sales: 1, credits: 5, grossMnt: 5000, earningMnt: 3500 },
      REFERRAL: { sales: 2, credits: 25, grossMnt: 25_000, earningMnt: 22_500 },
    });
    expect(v.courses[0]).toMatchObject({ courseSales: 1, lessonSales: 2, credits: 30 });
    expect(v.lessons.map((l) => [l.title, l.sales])).toEqual([
      ['L1', 1],
      ['L2', 1],
    ]);
    // /teacher/earnings-ийн үлдэгдэлтэй ижил (тест бичилтгүй)
    expect(v.balanceMnt).toBe(26_000);
    expect((await a.agent.get('/teacher/earnings').expect(200)).body.balanceMnt).toBe(26_000);
  });

  it('багш зөвхөн өөрийн өгөгдлийг харна; өөр багшийн курсийн видео аналитик 404; багш биш 403', async () => {
    const a = await teacher('a@example.mn');
    const b = await teacher('b@example.mn');
    const ca = await course(a.user.id, [{ title: 'A1' }], 'А курс');
    const cb = await course(b.user.id, [{ title: 'B1', type: 'VIDEO' }], 'Б курс');
    const u = await learner();
    await sale({ teacherId: a.user.id, userId: u, courseId: ca.courseId, lessonId: ca.lessonIds[0], credits: 3, at: '2026-11-05T04:00:00Z' });
    await sale({ teacherId: b.user.id, userId: u, courseId: cb.courseId, lessonId: cb.lessonIds[0], credits: 7, at: '2026-11-05T04:00:00Z' });
    await progress(u, cb.courseId, cb.lessonIds[0]!, 100, true);

    const va = await overview(a.agent, 'from=2026-11-01&to=2026-11-10');
    expect(va.totals.credits).toBe(3);
    expect(va.courses.map((c) => c.title)).toEqual(['А курс']);
    expect(va.lessons.map((l) => l.title)).toEqual(['A1']);
    const vb = await overview(b.agent, 'from=2026-11-01&to=2026-11-10');
    expect(vb.totals.credits).toBe(7);
    expect(vb.courses.map((c) => c.title)).toEqual(['Б курс']);

    expect((await a.agent.get(`/teacher/analytics/courses/${cb.courseId}/video`).expect(404)).body.code).toBe('NOT_FOUND');
    expect(t.mux.engagementCalls).toHaveLength(0);

    const plain = await loginByEmail(t, 'learner@example.mn');
    await plain.agent.get('/teacher/analytics').expect(403);
    await t.http().get('/teacher/analytics').expect(401);
  });

  it('бодит худалдан авалтын урсгалаар (HTTP) бичигдсэн борлуулалт харагдана', async () => {
    const a = await teacher('a@example.mn');
    const { courseId, lessonIds } = await course(a.user.id, [{ title: 'L1' }]);
    const buyer = await loginByEmail(t, 'buyer@example.mn');
    await t.prisma.$transaction(
      (tx) => credits.grant(tx, { userId: buyer.user.id, credits: 50, source: 'ADMIN_ADJUST' }),
      CREDIT_TX_OPTIONS,
    );
    await buyer.agent.post(`/purchases/lessons/${lessonIds[0]}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);
    const v = await overview(a.agent, '');
    expect(v.totals.sales).toBe(1);
    expect(v.totals.credits).toBe(5);
    expect(v.totals.earningMnt).toBeGreaterThan(0);
    expect(v.attribution.PLATFORM.sales).toBe(1);
    expect(v.courses[0]).toMatchObject({ courseId, lessonSales: 1, learners: 1 });
  });
});

describe('Дуусгалтын хувь', () => {
  it('суралцагч = тест бус эзэмшигч; дууссан = бүх идэвхтэй lesson completed (draft, live тооцохгүй)', async () => {
    const a = await teacher('a@example.mn');
    const { courseId, lessonIds } = await course(a.user.id, [
      { title: 'L1' },
      { title: 'L2', type: 'QUIZ' },
      { title: 'Draft', review: 'DRAFT' },
      { title: 'Live', type: 'LIVE' },
    ]);
    const [l1, l2] = lessonIds as [string, string];
    const base = { teacherId: a.user.id, courseId };
    const done = await learner();
    const half = await learner();
    const tester = await learner();
    await sale({ ...base, userId: done, credits: 20, courseLessonIds: [l1, l2], at: '2026-11-05T04:00:00Z' });
    await sale({ ...base, userId: half, lessonId: l1, credits: 5, at: '2026-11-05T04:00:00Z' });
    await sale({ ...base, userId: tester, lessonId: l1, credits: 5, at: '2026-11-05T04:00:00Z', isTest: true });
    await progress(done, courseId, l1, 0, true);
    await progress(done, courseId, l2, 0, true);
    await progress(half, courseId, l1, 0, true);
    await progress(tester, courseId, l1, 0, true);

    const v = await overview(a.agent, 'from=2026-11-01&to=2026-11-10');
    expect(v.courses[0]).toMatchObject({ learners: 2, completedLearners: 1, completionPercent: 50 });
  });
});

describe('Видео: Mux Data үзэлт ба зогсдог цэг', () => {
  it('Mux Data-аас үзэлт/хугацаа (курс = sub_property_id), drop-off = хүрсэн хамгийн хол байрлал', async () => {
    const a = await teacher('a@example.mn');
    const { courseId, lessonIds } = await course(a.user.id, [
      { title: 'V1', type: 'VIDEO', durationSeconds: 600 },
      { title: 'V2', type: 'VIDEO' },
      { title: 'Text' },
    ]);
    const [v1, v2] = lessonIds as [string, string];
    t.mux.setEngagement(courseId, [
      { videoId: v1, views: 4, watchTimeMs: 1_200_000, playingTimeMs: 1_100_000 },
      { videoId: 'other-video', views: 99, watchTimeMs: 1, playingTimeMs: 1 },
    ]);
    for (const pct of [5, 15, 45, 47, 95, 100]) await progress(await learner(), courseId, v1, pct, pct >= 90);
    await progress(a.user.id, courseId, v1, 30, false); // багш өөрөө — тооцохгүй

    const r = await video(a.agent, courseId, 'from=2026-11-09&to=2026-11-10');
    expect(r.mux).toBe('OK');
    expect(t.mux.engagementCalls[0]).toEqual({
      subPropertyId: courseId,
      from: new Date('2026-11-08T16:00:00Z'),
      to: new Date('2026-11-10T16:00:00Z'),
    });
    expect(r.lessons.map((l) => l.title)).toEqual(['V1', 'V2']);
    const [s1, s2] = r.lessons as [CourseVideoAnalyticsView['lessons'][number], CourseVideoAnalyticsView['lessons'][number]];
    expect(s1).toMatchObject({
      durationSeconds: 600,
      views: 4,
      watchTimeSeconds: 1200,
      avgWatchSecondsPerView: 300,
      learners: 6,
      completedLearners: 2,
    });
    expect(s1.dropOff.map((b) => b.learners)).toEqual([1, 1, 0, 0, 2, 0, 0, 0, 0, 2]);
    expect(s2).toMatchObject({ views: 0, watchTimeSeconds: 0, avgWatchSecondsPerView: 0, learners: 0 });
  });

  it('Mux тохируулаагүй → NOT_CONFIGURED, Mux алдаа → UNAVAILABLE; drop-off хэвээр', async () => {
    const a = await teacher('a@example.mn');
    const { courseId, lessonIds } = await course(a.user.id, [{ title: 'V1', type: 'VIDEO' }]);
    await progress(await learner(), courseId, lessonIds[0]!, 55, false);

    t.mux.dataFailing = true;
    const failed = await video(a.agent, courseId);
    expect(failed.mux).toBe('UNAVAILABLE');
    expect(failed.lessons[0]).toMatchObject({ views: null, watchTimeSeconds: null, learners: 1 });
    expect(failed.lessons[0]!.dropOff[5]!.learners).toBe(1);

    t.mux.enabled = false;
    const disabled = await video(a.agent, courseId);
    expect(disabled.mux).toBe('NOT_CONFIGURED');
    expect(disabled.lessons[0]).toMatchObject({ views: null, learners: 1 });
  });
});
