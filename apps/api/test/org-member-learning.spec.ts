import type { LessonType, Prisma } from '@lms/db';
import { ensureHouseTeacher } from '../src/organizations/house-teacher';
import { createTestApp, loginByEmail, type TestApp } from './harness';

jest.setTimeout(180_000);

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

// Fixture: PRIVATE курс (house teacher-ийнх), байгууллага, гишүүнчлэл DB-д шууд; үйлдэл HTTP-ээр.
const DAY = 24 * 60 * 60_000;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q1 = id(1), Q1A = id(11), Q1B = id(12);
const QUIZ = {
  passPercent: 60,
  questions: [{ id: Q1, text: '2 + 2 = ?', multiple: false, options: [{ id: Q1A, text: '3' }, { id: Q1B, text: '4' }], correctOptionIds: [Q1B] }],
};
const CODE_RE = /^[A-HJ-NP-Z2-9]{16}$/;

let seq = 0;

async function houseTeacher() {
  await ensureHouseTeacher(t.prisma, { identifier: 'house@example.mn' });
  return loginByEmail(t, 'house@example.mn');
}

async function member(email = 'member@example.mn', name: string | null = 'Гишүүн Ажилтан') {
  const s = await loginByEmail(t, email);
  if (name) await s.agent.patch('/me').send({ name }).expect(200);
  return s;
}

/** TEXT, QUIZ, VIDEO — сертификатад тооцогдох 3 lesson + нэг LIVE (тооцогдохгүй). */
async function course(teacherId: string, visibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE') {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Хаалттай курс ${++seq}`,
      visibility,
      priceCredits: visibility === 'PUBLIC' ? 10 : 0,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const specs: { type: LessonType; content: Prisma.InputJsonValue }[] = [
    { type: 'TEXT', content: { markdown: 'агуулга' } },
    { type: 'QUIZ', content: QUIZ as unknown as Prisma.InputJsonValue },
    { type: 'VIDEO', content: {} },
    { type: 'LIVE', content: { startsAt: new Date(Date.now() + 3 * DAY).toISOString(), durationMinutes: 60, meetingUrl: 'https://meet.example/x' } },
  ];
  const ids: string[] = [];
  for (const [i, s] of specs.entries()) {
    const lesson = await t.prisma.lesson.create({
      data: { courseId: row.id, sectionId: row.sections[0]!.id, title: `Хичээл ${i + 1}`, type: s.type, position: i, priceCredits: 0, reviewStatus: 'APPROVED', content: s.content },
    });
    ids.push(lesson.id);
  }
  const video = await t.prisma.lessonVideo.create({
    data: { lessonId: ids[2]!, muxUploadId: `up-${seq}`, muxAssetId: `asset-${seq}`, playbackId: `pb-${seq}`, status: 'READY', durationSeconds: 60 },
  });
  await t.prisma.lesson.update({ where: { id: ids[2]! }, data: { content: { videoId: video.id, status: 'READY', durationSeconds: 60, error: null } } });
  return { id: row.id, title: row.title, text: ids[0]!, quiz: ids[1]!, video: ids[2]!, live: ids[3]! };
}
type Course = Awaited<ReturnType<typeof course>>;

async function org(grantCourseIds: string[], name = `Компани ${++seq}`) {
  return t.prisma.organization.create({
    data: {
      name,
      active: true,
      contractEndsAt: new Date(Date.now() + 30 * DAY),
      seatLimit: 10,
      courseGrants: { create: grantCourseIds.map((courseId) => ({ courseId })) },
    },
  });
}
const join = (organizationId: string, userId: string) => t.prisma.organizationMember.create({ data: { organizationId, userId } });
const remove = (userId: string) => t.prisma.organizationMember.updateMany({ where: { userId }, data: { removedAt: new Date() } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const myCourses = async (a: Agent) => (await a.get('/learning/courses').expect(200)).body as Array<Record<string, any>>;

async function ownCourse(userId: string, c: Course, teacherId: string) {
  const purchase = await t.prisma.purchase.create({
    data: { userId, courseId: c.id, teacherId, kind: 'COURSE', listCredits: 0, credits: 0, creditPriceMnt: 1000, commissionPercent: 0 },
  });
  await t.prisma.courseEntitlement.create({ data: { userId, courseId: c.id, purchaseId: purchase.id } });
}

async function finishAll(a: Agent, c: Course) {
  await a.post(`/learning/lessons/${c.text}/complete`).expect(200);
  await a.post(`/learning/lessons/${c.video}/progress`).send({ watchedPercent: 100 }).expect(200);
  await a.post(`/learning/lessons/${c.quiz}/quiz-attempts`).send({ answers: [{ questionId: Q1, optionIds: [Q1B] }] }).expect(201);
}

describe('Миний сургалт — байгууллагын курсууд (story 87)', () => {
  it('байгууллагын курс байгууллагын нэртэй; явц эзэмшсэнтэй адил тооцогдоно', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id], 'Монгол Ложистик');
    const m = await member();
    await join(company.id, m.user.id);

    let cards = await myCourses(m.agent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: c.id,
      isPrivate: true,
      locked: false,
      ownsCourse: false,
      organizations: [{ id: company.id, name: 'Монгол Ложистик' }],
      ownedLessonCount: 4,
      completedLessonCount: 0,
      progressPercent: 0,
    });
    expect(cards[0]).not.toHaveProperty('priceCredits');

    await m.agent.post(`/learning/lessons/${c.text}/complete`).expect(200);
    cards = await myCourses(m.agent);
    expect(cards[0]).toMatchObject({ completedLessonCount: 1, ownedLessonCount: 4, progressPercent: 25, locked: false });

    const detail = (await m.agent.get(`/learning/courses/${c.id}`).expect(200)).body;
    expect(detail).toMatchObject({ isPrivate: true, locked: false, organizations: [{ name: 'Монгол Ложистик' }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(detail.sections.flatMap((s: any) => s.lessons).every((l: any) => l.owned === true)).toBe(true);
  });

  it('нэг курс эзэмшсэн ба байгууллагаас хоёулаа → нэг л мөр', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id], 'Дедуп ХХК');
    const second = await org([c.id], 'Хоёр дахь ХХК');
    const m = await member();
    await join(company.id, m.user.id);
    await join(second.id, m.user.id);
    await ownCourse(m.user.id, c, house.user.id);

    const cards = await myCourses(m.agent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: c.id, ownsCourse: true, locked: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(cards[0]!.organizations.map((o: any) => o.name).sort()).toEqual(['Дедуп ХХК', 'Хоёр дахь ХХК']);
  });

  it('PUBLIC курсийн карт байгууллагын талбаргүй (organizations хоосон, isPrivate=false)', async () => {
    const house = await houseTeacher();
    const pub = await course(house.user.id, 'PUBLIC');
    const m = await member();
    await ownCourse(m.user.id, pub, house.user.id);
    const cards = await myCourses(m.agent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ isPrivate: false, locked: false, organizations: [] });
  });
});

describe('Эрх хаагдсан үеийн төлөв (story 88)', () => {
  async function started() {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id], 'Түр ХХК');
    const m = await member();
    await join(company.id, m.user.id);
    await m.agent.post(`/learning/lessons/${c.text}/complete`).expect(200);
    return { house, c, company, m };
  }

  async function expectLocked(m: { agent: Agent }, c: Course, orgName?: string) {
    const cards = await myCourses(m.agent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: c.id, locked: true, isPrivate: true, completedLessonCount: 1, progressPercent: 25, continueLessonId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (orgName) expect(cards[0]!.organizations.map((o: any) => o.name)).toContain(orgName);
    const detail = (await m.agent.get(`/learning/courses/${c.id}`).expect(200)).body;
    expect(detail).toMatchObject({ locked: true, progressPercent: 25 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(detail.sections.flatMap((s: any) => s.lessons).every((l: any) => l.owned === false)).toBe(true);
    // Контент нээгдэхгүй
    await m.agent.get(`/catalog/lessons/${c.text}`).expect(404);
    await m.agent.get(`/learning/lessons/${c.quiz}`).expect(404);
    await m.agent.get(`/catalog/courses/${c.id}`).expect(404);
  }

  it('гишүүн хасагдсан → курс "locked", явц хадгалагдана, контент хаалттай', async () => {
    const { c, m } = await started();
    await remove(m.user.id);
    await expectLocked(m, c, 'Түр ХХК');
  });

  it('байгууллага идэвхгүй болсон / гэрээ дууссан → locked', async () => {
    const a = await started();
    await t.prisma.organization.update({ where: { id: a.company.id }, data: { active: false } });
    await expectLocked(a.m, a.c, 'Түр ХХК');
    await t.prisma.organization.update({ where: { id: a.company.id }, data: { active: true, contractEndsAt: new Date(Date.now() - DAY) } });
    await expectLocked(a.m, a.c, 'Түр ХХК');
  });

  it('grant цуцлагдсан → locked (байгууллагын нэр үл мэдэгдэж болно)', async () => {
    const { c, company, m } = await started();
    await t.prisma.organizationCourseGrant.deleteMany({ where: { organizationId: company.id } });
    await expectLocked(m, c);
  });

  it('эрх сэргэвэл нээгдэж, явц үргэлжилнэ', async () => {
    const { c, company, m } = await started();
    await remove(m.user.id);
    await join(company.id, m.user.id);
    const cards = await myCourses(m.agent);
    expect(cards[0]).toMatchObject({ locked: false, completedLessonCount: 1 });
    await m.agent.get(`/catalog/lessons/${c.text}`).expect(200);
  });

  it('явц байхгүй бол хасагдсаны дараа жагсаалтад гарахгүй; house teacher өөрийн курсээр locked мөр үүсгэхгүй', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id]);
    const m = await member();
    await join(company.id, m.user.id);
    await remove(m.user.id);
    expect(await myCourses(m.agent)).toEqual([]);
    await house.agent.post(`/learning/lessons/${c.text}/complete`).expect(200);
    expect(await myCourses(house.agent)).toEqual([]);
  });
});

describe('Сертификат — байгууллагын эрхээр (story 89)', () => {
  it('гишүүн бүх lesson + quiz дуусгахад автоматаар сертификат авна; teacherName = house teacher', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id]);
    const m = await member('cert@example.mn', 'Сертификат Авагч');
    await join(company.id, m.user.id);

    const before = (await m.agent.get(`/learning/courses/${c.id}/certificate`).expect(200)).body;
    expect(before.certificate).toBeNull();
    expect(before.eligibility).toMatchObject({ ownsCourse: true, viaOrganization: true, eligible: false });

    await finishAll(m.agent, c);
    const after = (await m.agent.get(`/learning/courses/${c.id}/certificate`).expect(200)).body;
    expect(after.certificate).toMatchObject({ courseId: c.id, recipientName: 'Сертификат Авагч', courseTitle: c.title, quizAveragePercent: 100 });
    expect(after.certificate.code).toMatch(CODE_RE);
    const teacher = await t.prisma.user.findUniqueOrThrow({ where: { id: house.user.id }, select: { name: true } });
    expect(after.certificate.teacherName).toBe(teacher.name);
  });

  it('байгууллагын эрхгүй хүн бүх нөхцөл (явц) биелсэн ч сертификат авч чадахгүй', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const stranger = await member('stranger@example.mn');
    for (const l of [c.text, c.quiz, c.video]) {
      await t.prisma.lessonProgress.create({
        data: { userId: stranger.user.id, lessonId: l, courseId: c.id, completedAt: new Date(), bestScorePercent: 100, watchedPercent: 100 },
      });
    }
    const res = await stranger.agent.post(`/learning/courses/${c.id}/certificate`);
    expect(res.status).toBe(409);
    expect(await t.prisma.certificate.count()).toBe(0);
  });

  it('хасагдсаны дараа сертификат хадгалагдана, татагдана, нийтийн verify ажиллана', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id]);
    const m = await member('cert@example.mn', 'Сертификат Авагч');
    await join(company.id, m.user.id);
    await finishAll(m.agent, c);
    const { code, teacherName } = (await m.agent.get(`/learning/courses/${c.id}/certificate`).expect(200)).body.certificate;

    await remove(m.user.id);
    await t.prisma.organization.update({ where: { id: company.id }, data: { active: false } });

    const status = (await m.agent.get(`/learning/courses/${c.id}/certificate`).expect(200)).body;
    expect(status.certificate.code).toBe(code);
    expect(status.eligibility.ownsCourse).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await m.agent.get('/learning/certificates').expect(200)).body.map((x: any) => x.code)).toContain(code);
    const pdf = await m.agent.get(`/learning/certificates/${code}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const verify = (await t.http().get(`/certificates/verify/${code}`).expect(200)).body;
    expect(verify).toMatchObject({ code, recipientName: 'Сертификат Авагч', courseTitle: c.title, teacherName });
    const again = await m.agent.post(`/learning/courses/${c.id}/certificate`).expect(200);
    expect(again.body.code).toBe(code);
  });
});

describe('Private курсийн хуудас — эрхгүй хэрэглэгчид 404', () => {
  it('гишүүн биш, зочин: курсийн хуудас, lesson, "Миний сургалт" дэлгэрэнгүй — 404; гишүүнд 200', async () => {
    const house = await houseTeacher();
    const c = await course(house.user.id);
    const company = await org([c.id]);
    const stranger = await member('stranger@example.mn');
    const m = await member();
    await join(company.id, m.user.id);

    await t.http().get(`/catalog/courses/${c.id}`).expect(404);
    await stranger.agent.get(`/catalog/courses/${c.id}`).expect(404);
    await stranger.agent.get(`/catalog/lessons/${c.text}`).expect(404);
    await stranger.agent.get(`/learning/courses/${c.id}`).expect(404);
    await m.agent.get(`/catalog/courses/${c.id}`).expect(200);
  });
});
