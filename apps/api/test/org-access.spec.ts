import type { LessonType, Prisma } from '@lms/db';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { ensureHouseTeacher, getHouseTeacherId } from '../src/organizations/house-teacher';
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
// Fixture-ууд: курс, байгууллага, гишүүнчлэл DB-д шууд (админы удирдлага ticket 45/46); эрхийн шалгалт HTTP-ээр.
// ---------------------------------------------------------------------------

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q1 = id(1), Q1A = id(11), Q1B = id(12);
const QUIZ = {
  passPercent: 60,
  questions: [{ id: Q1, text: '2 + 2 = ?', multiple: false, options: [{ id: Q1A, text: '3' }, { id: Q1B, text: '4' }], correctOptionIds: [Q1B] }],
};
const MEET = 'https://meet.google.com/abc-defg-hij';
const DAY = 24 * 60 * 60_000;

async function houseTeacher() {
  await ensureHouseTeacher(t.prisma, { identifier: 'house@example.mn' });
  return loginByEmail(t, 'house@example.mn');
}

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

async function learner(email: string) {
  return loginByEmail(t, email);
}

let seq = 0;

/** Нийтлэгдсэн PRIVATE курс (house teacher-ийнх): TEXT, QUIZ, LIVE, VIDEO. */
async function privateCourse(teacherId: string) {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Хаалттай курс ${++seq}`,
      visibility: 'PRIVATE',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const specs: { type: LessonType; content: Prisma.InputJsonValue }[] = [
    { type: 'TEXT', content: { markdown: 'нууц агуулга' } },
    { type: 'QUIZ', content: QUIZ as unknown as Prisma.InputJsonValue },
    { type: 'LIVE', content: { startsAt: new Date(Date.now() + 3 * DAY).toISOString(), durationMinutes: 60, meetingUrl: MEET } },
    { type: 'VIDEO', content: {} },
  ];
  const lessonIds: string[] = [];
  for (const [i, s] of specs.entries()) {
    const lesson = await t.prisma.lesson.create({
      data: {
        courseId: row.id,
        sectionId: row.sections[0]!.id,
        title: `Хичээл ${i + 1}`,
        type: s.type,
        position: i,
        reviewStatus: 'APPROVED',
        content: s.content,
      },
    });
    lessonIds.push(lesson.id);
  }
  // VIDEO lesson-д бэлэн бичлэг
  const video = await t.prisma.lessonVideo.create({
    data: { lessonId: lessonIds[3]!, muxUploadId: `up-${seq}`, muxAssetId: `asset-${seq}`, playbackId: `pb-${seq}`, status: 'READY', durationSeconds: 60 },
  });
  await t.prisma.lesson.update({
    where: { id: lessonIds[3]! },
    data: { content: { videoId: video.id, status: 'READY', durationSeconds: 60, error: null } },
  });
  const [text, quiz, live, vid] = lessonIds as [string, string, string, string];
  return { id: row.id, text, quiz, live, video: vid, lessonIds };
}

interface OrgOpts {
  active?: boolean;
  contractEndsAt?: Date;
  seatLimit?: number;
}

async function org(grantCourseIds: string[], opts: OrgOpts = {}) {
  return t.prisma.organization.create({
    data: {
      name: `Компани ${++seq}`,
      active: opts.active ?? true,
      contractEndsAt: opts.contractEndsAt ?? new Date(Date.now() + 30 * DAY),
      seatLimit: opts.seatLimit ?? 10,
      courseGrants: { create: grantCourseIds.map((courseId) => ({ courseId })) },
    },
  });
}

const join = (organizationId: string, userId: string) => t.prisma.organizationMember.create({ data: { organizationId, userId } });

const lessonGet = (a: Agent, lessonId: string) => a.get(`/catalog/lessons/${lessonId}`);
const quizAttempt = (a: Agent, lessonId: string) =>
  a.post(`/learning/lessons/${lessonId}/quiz-attempts`).send({ answers: [{ questionId: Q1, optionIds: [Q1B] }] });
const playback = (a: Agent, lessonId: string) => a.post(`/media/lessons/${lessonId}/playback`).send({ deviceId: 'device-0001' });

/** Бүх контентын хаалт: текст, live линк, quiz, явц, видео token — бүгд ижил дүрмээр. */
async function expectOpen(a: Agent, c: Awaited<ReturnType<typeof privateCourse>>) {
  const text = await lessonGet(a, c.text).expect(200);
  expect(text.body).toMatchObject({ access: 'ORG', content: { markdown: 'нууц агуулга' } });
  expect((await lessonGet(a, c.live).expect(200)).body.content.meetingUrl).toBe(MEET);
  const q = await a.get(`/learning/lessons/${c.quiz}`).expect(200);
  expect(q.body.quiz).toMatchObject({ questionCount: 1 });
  await a.post(`/learning/lessons/${c.text}/progress`).send({}).expect(200);
  await playback(a, c.video).expect(200);
}

async function expectClosed(a: Agent, c: Awaited<ReturnType<typeof privateCourse>>) {
  await lessonGet(a, c.text).expect(404);
  await lessonGet(a, c.live).expect(404);
  await a.get(`/learning/lessons/${c.quiz}`).expect(404);
  await quizAttempt(a, c.quiz).expect(404);
  await a.post(`/learning/lessons/${c.text}/progress`).send({}).expect(404);
  await a.post(`/learning/lessons/${c.text}/complete`).expect(404);
  await playback(a, c.video).expect(404);
}

// ---------------------------------------------------------------------------

describe('Байгууллагын эрх — lesson нээх дүрэм', () => {
  it('гишүүн + grant → бүх контент нээгдэнэ (текст, live линк, quiz, явц, Mux token); Entitlement мөр үүсэхгүй', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(company.id, m.user.id);

    await expectOpen(m.agent, c);
    const attempt = await quizAttempt(m.agent, c.quiz).expect(201);
    expect(attempt.body.attempt).toMatchObject({ passed: true });
    expect(await t.prisma.entitlement.count()).toBe(0);
    expect(await t.prisma.courseEntitlement.count()).toBe(0);
    expect(await t.prisma.purchase.count()).toBe(0);
  });

  it('grant-гүй байгууллагын гишүүн, гишүүн биш хүн, зочин — хаалттай (private курс 404, оршин буйг илчлэхгүй)', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const other = await privateCourse(house.user.id);
    const noGrant = await org([other.id]);
    const m = await learner('member@example.mn');
    await join(noGrant.id, m.user.id);
    const stranger = await learner('stranger@example.mn');

    await expectClosed(m.agent, c);
    await expectClosed(stranger.agent, c);
    await t.http().get(`/catalog/lessons/${c.text}`).expect(404);
    // Хариу нь "байхгүй"-тэй ижил — LESSON_LOCKED биш
    expect((await lessonGet(m.agent, c.text)).body.code).toBe('NOT_FOUND');
  });

  it.each([
    ['хасагдсан гишүүн', async (o: { id: string }, userId: string) => {
      await t.prisma.organizationMember.updateMany({ where: { organizationId: o.id, userId }, data: { removedAt: new Date() } });
    }],
    ['идэвхгүй болгосон байгууллага', async (o: { id: string }) => {
      await t.prisma.organization.update({ where: { id: o.id }, data: { active: false } });
    }],
    ['гэрээ дууссан байгууллага', async (o: { id: string }) => {
      await t.prisma.organization.update({ where: { id: o.id }, data: { contractEndsAt: new Date(Date.now() - 1000) } });
    }],
    ['grant цуцалсан', async (o: { id: string }) => {
      await t.prisma.organizationCourseGrant.deleteMany({ where: { organizationId: o.id } });
    }],
  ])('%s → тэр дороо хаагдана; явц хэвээр, эрх сэргэхэд үргэлжилнэ', async (_name, revoke) => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(company.id, m.user.id);
    await expectOpen(m.agent, c);
    await quizAttempt(m.agent, c.quiz).expect(201);
    const progressBefore = await t.prisma.lessonProgress.findMany({ where: { userId: m.user.id }, orderBy: { lessonId: 'asc' } });
    expect(progressBefore.length).toBeGreaterThan(0);

    await revoke(company, m.user.id);
    await expectClosed(m.agent, c);
    // Прогресс, quiz оролдлого устахгүй
    expect(await t.prisma.lessonProgress.findMany({ where: { userId: m.user.id }, orderBy: { lessonId: 'asc' } })).toEqual(progressBefore);
    expect(await t.prisma.quizAttempt.count({ where: { userId: m.user.id } })).toBe(1);

    // Эрх сэргээх
    await t.prisma.organization.update({ where: { id: company.id }, data: { active: true, contractEndsAt: new Date(Date.now() + DAY) } });
    await t.prisma.organizationCourseGrant.upsert({
      where: { organizationId_courseId: { organizationId: company.id, courseId: c.id } },
      create: { organizationId: company.id, courseId: c.id },
      update: {},
    });
    const active = await t.prisma.organizationMember.count({ where: { organizationId: company.id, userId: m.user.id, removedAt: null } });
    if (active === 0) await join(company.id, m.user.id); // хасагдсан гишүүнийг дахин нэмэх = шинэ мөр
    await expectOpen(m.agent, c);
    const state = await m.agent.get(`/learning/lessons/${c.quiz}`).expect(200);
    expect(state.body.quiz).toMatchObject({ passed: true, bestScorePercent: 100 });
    expect(await t.prisma.lessonProgress.count({ where: { userId: m.user.id } })).toBeGreaterThanOrEqual(progressBefore.length);
  });

  it('олон байгууллагын гишүүн: нэг нь дууссан ч нөгөө нь идэвхтэй бол нээлттэй', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const expired = await org([c.id], { contractEndsAt: new Date(Date.now() - DAY) });
    const live = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(expired.id, m.user.id);
    await expectClosed(m.agent, c);
    await join(live.id, m.user.id);
    await expectOpen(m.agent, c);
  });

  it('нэг org × user-д идэвхтэй мөр нэг л байна; хасагдсаны дараа шинэ мөр нэмж болно', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(company.id, m.user.id);
    await expect(join(company.id, m.user.id)).rejects.toThrow();
    await t.prisma.organizationMember.updateMany({ where: { organizationId: company.id }, data: { removedAt: new Date() } });
    await join(company.id, m.user.id);
    expect(await t.prisma.organizationMember.count({ where: { organizationId: company.id } })).toBe(2);
  });

  it('байгууллагын эрх нь бусад PUBLIC курсийг нээхгүй (entitlement/preview дүрэм хэвээр)', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(company.id, m.user.id);
    const tch = await t.prisma.user.create({ data: { name: 'Багш', roles: ['TEACHER'] } });
    const pub = await t.prisma.course.create({
      data: {
        teacherId: tch.id,
        title: 'Нийтийн курс',
        priceCredits: 10,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sections: { create: { title: '1', position: 0 } },
      },
      include: { sections: true },
    });
    const lesson = await t.prisma.lesson.create({
      data: { courseId: pub.id, sectionId: pub.sections[0]!.id, title: 'Текст', type: 'TEXT', position: 0, priceCredits: 5, reviewStatus: 'APPROVED', content: { markdown: 'x' } },
    });
    expect((await lessonGet(m.agent, lesson.id)).status).toBe(403);
  });

  it('курсийн хуудас: private курс зөвхөн эрхтэйд (гишүүн, house teacher, админ); viewer.orgAccess', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(company.id, m.user.id);
    const stranger = await learner('stranger@example.mn');
    const adm = await admin();

    await t.http().get(`/catalog/courses/${c.id}`).expect(404);
    await stranger.agent.get(`/catalog/courses/${c.id}`).expect(404);
    const asMember = (await m.agent.get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(asMember).toMatchObject({ visibility: 'PRIVATE', viewer: { orgAccess: true, canViewAll: false, ownsCourse: false } });
    expect(asMember.pricing).toMatchObject({ listCredits: 0, payableCredits: 0 });
    await house.agent.get(`/catalog/courses/${c.id}`).expect(200);
    await adm.agent.get(`/catalog/courses/${c.id}`).expect(200);

    // Хасагдсны дараа хуудас ч хаагдана
    await t.prisma.organizationMember.updateMany({ where: { userId: m.user.id }, data: { removedAt: new Date() } });
    await m.agent.get(`/catalog/courses/${c.id}`).expect(404);
  });
});

describe('Private курс — нийтийн гадаргуу, худалдан авалт', () => {
  it('каталог, хайлт, багшийн профайл, review дараалалд гарахгүй; PUBLIC курс хэвийн', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    await t.prisma.course.update({ where: { id: c.id }, data: { title: 'Нууцлалтай сургалт', description: 'Нууцлалтай сургалт' } });
    const tch = await t.prisma.user.create({ data: { name: 'Багш', roles: ['TEACHER'] } });
    await t.prisma.course.create({
      data: { teacherId: tch.id, title: 'Нийтийн курс', priceCredits: 10, status: 'PUBLISHED', publishedAt: new Date() },
    });
    // Админ review дараалал: PRIVATE нь IN_REVIEW байх боломжгүй ч, байсан ч орохгүй
    await t.prisma.course.create({ data: { teacherId: house.user.id, title: 'Draft', visibility: 'PRIVATE', status: 'IN_REVIEW', submittedAt: new Date() } });
    const adm = await admin();

    const list = (await t.http().get('/catalog/courses').expect(200)).body;
    expect(list.items.map((i: { title: string }) => i.title)).toEqual(['Нийтийн курс']);
    const search = (await t.http().get('/catalog/courses').query({ q: 'Нууцлалтай' }).expect(200)).body;
    expect(search.items).toEqual([]);
    const profile = (await t.http().get(`/catalog/teachers/${house.user.id}`).expect(200)).body;
    expect(profile.courses).toEqual([]);
    const queue = (await adm.agent.get('/admin/course-reviews').expect(200)).body;
    expect(queue).toEqual([]);
  });

  it('private курсийг худалдаж авах оролдлого 4xx (lesson ба бүтэн курс), юу ч бичигдэхгүй', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    await t.prisma.course.update({ where: { id: c.id }, data: { priceCredits: 10 } });
    await t.prisma.lesson.update({ where: { id: c.text }, data: { priceCredits: 5 } });
    const buyer = await learner('buyer@example.mn');
    await t.prisma.$transaction(
      (tx) => credits.grant(tx, { userId: buyer.user.id, credits: 100, source: 'ADMIN_ADJUST' }),
      CREDIT_TX_OPTIONS,
    );
    const lessonRes = await buyer.agent.post(`/purchases/lessons/${c.text}`).send({ confirmNoRefund: true, expectedCredits: 5 });
    const courseRes = await buyer.agent.post(`/purchases/courses/${c.id}`).send({ confirmNoRefund: true, expectedCredits: 10 });
    expect(lessonRes.status).toBeGreaterThanOrEqual(400);
    expect(lessonRes.status).toBeLessThan(500);
    expect(courseRes.status).toBeGreaterThanOrEqual(400);
    expect(courseRes.status).toBeLessThan(500);
    expect(await t.prisma.purchase.count()).toBe(0);
    expect(await t.prisma.entitlement.count()).toBe(0);
  });

  it('private курст үнэлгээ бичихгүй, үнэлгээний жагсаалт 404', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org([c.id]);
    const m = await learner('member@example.mn');
    await join(company.id, m.user.id);
    await m.agent.put(`/courses/${c.id}/review`).send({ rating: 5, text: 'сайн' }).expect(404);
    await t.http().get(`/catalog/courses/${c.id}/reviews`).expect(404);
  });
});

describe('Private курс зохиох (house teacher)', () => {
  it('house teacher-ийг дахин ажиллуулахад аюулгүй үүсгэнэ: брэнд нэр, TEACHER, тохиргоонд id', async () => {
    const first = await ensureHouseTeacher(t.prisma);
    const second = await ensureHouseTeacher(t.prisma, { identifier: 'house@example.mn' });
    expect(first.created).toBe(true);
    expect(second).toEqual({ userId: first.userId, created: false });
    expect(await getHouseTeacherId(t.prisma)).toBe(first.userId);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: first.userId } });
    expect(user).toMatchObject({ name: 'Суралц', roles: ['TEACHER'] });
    expect(await t.prisma.user.count()).toBe(1);
    // Өөр хэрэглэгчийн identifier-ийг булаахгүй
    await loginByEmail(t, 'other@example.mn');
    await expect(ensureHouseTeacher(t.prisma, { identifier: 'other@example.mn' })).rejects.toThrow();
  });

  it('house teacher биш багш PRIVATE курс үүсгэхэд 403; PUBLIC хэвээр', async () => {
    await ensureHouseTeacher(t.prisma);
    const s = await loginByEmail(t, 'teacher@example.mn');
    await grantRoleByIdentifier(t.prisma, 'teacher@example.mn', 'TEACHER');
    const res = await s.agent.post('/teacher/courses').send({ title: 'Нууц', visibility: 'PRIVATE' }).expect(403);
    expect(res.body.code).toBe('HOUSE_TEACHER_ONLY');
    const pub = await s.agent.post('/teacher/courses').send({ title: 'Нийтийн' }).expect(201);
    expect(pub.body.visibility).toBe('PUBLIC');
  });

  it('private курс: үнэ, assignment, үнэтэй/preview lesson татгалзана; submit нь review-гүй шууд PUBLISHED', async () => {
    const house = await houseTeacher();
    const a = house.agent;
    const course = (await a.post('/teacher/courses').send({ title: 'Компанийн сургалт', visibility: 'PRIVATE' }).expect(201)).body;
    expect(course).toMatchObject({ visibility: 'PRIVATE', status: 'DRAFT' });
    await a.patch(`/teacher/courses/${course.id}`).send({ priceCredits: 10 }).expect(400);
    await a.patch(`/teacher/courses/${course.id}`).send({ description: 'Тайлбар' }).expect(200);

    const withSection = (await a.post(`/teacher/courses/${course.id}/sections`).send({ title: 'Бүлэг' }).expect(201)).body;
    const sectionId = withSection.sections[0].id;
    await a.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Даалгавар', type: 'ASSIGNMENT' }).expect(400);
    const withLesson = (await a.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Текст', type: 'TEXT' }).expect(201)).body;
    const lessonId = withLesson.sections[0].lessons[0].id;
    await a.patch(`/teacher/lessons/${lessonId}`).send({ priceCredits: 5 }).expect(400);
    await a.patch(`/teacher/lessons/${lessonId}`).send({ isFreePreview: true }).expect(400);
    await a.patch(`/teacher/lessons/${lessonId}`).send({ content: { markdown: 'Сайн байна уу' } }).expect(200);

    // Үнэ, ангилал, зураггүйгээр ч бэлэн
    const ready = (await a.get(`/teacher/courses/${course.id}`).expect(200)).body;
    expect(ready.problems).toEqual([]);

    const submitted = (await a.post(`/teacher/courses/${course.id}/submit`).expect(200)).body;
    expect(submitted).toMatchObject({ status: 'PUBLISHED', visibility: 'PRIVATE' });
    expect(submitted.sections[0].lessons[0]).toMatchObject({ reviewStatus: 'APPROVED' });

    // Нийтлэгдсэн private курсэд шинэ lesson → дахин submit → шууд APPROVED
    const more = (await a.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Текст 2', type: 'TEXT' }).expect(201)).body;
    const second = more.sections[0].lessons.find((l: { title: string }) => l.title === 'Текст 2');
    await a.patch(`/teacher/lessons/${second.id}`).send({ content: { markdown: 'нэмэлт' } }).expect(200);
    const again = (await a.post(`/teacher/courses/${course.id}/submit`).expect(200)).body;
    expect(again.sections[0].lessons.map((l: { reviewStatus: string }) => l.reviewStatus)).toEqual(['APPROVED', 'APPROVED']);

    // Нийтийн каталогт хэзээ ч гарахгүй
    expect((await t.http().get('/catalog/courses').expect(200)).body.items).toEqual([]);
  });
});
