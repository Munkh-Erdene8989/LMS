import { grantRoleByIdentifier } from '../src/admin/roles';
import { ensureHouseTeacher } from '../src/organizations/house-teacher';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
jest.setTimeout(180_000);

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const DAY = 24 * 60 * 60_000;
const NIL = '00000000-0000-4000-8000-000000000000';
let seq = 0;

async function houseTeacher() {
  await ensureHouseTeacher(t.prisma, { identifier: 'house@example.mn' });
  return loginByEmail(t, 'house@example.mn');
}

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

async function teacher(email: string) {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

/** Нийтлэгдсэн PRIVATE курс, нэг TEXT хичээлтэй. */
async function privateCourse(teacherId: string) {
  const course = await t.prisma.course.create({
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
  const lesson = await t.prisma.lesson.create({
    data: {
      courseId: course.id,
      sectionId: course.sections[0]!.id,
      title: 'Хичээл',
      type: 'TEXT',
      position: 0,
      reviewStatus: 'APPROVED',
      content: { markdown: 'нууц агуулга' },
    },
  });
  return { id: course.id, lessonId: lesson.id };
}

async function publicCourse(teacherId: string) {
  return t.prisma.course.create({
    data: { teacherId, title: 'Нийтийн курс', visibility: 'PUBLIC', status: 'PUBLISHED', publishedAt: new Date() },
  });
}

const org = () =>
  t.prisma.organization.create({
    data: { name: `Компани ${++seq}`, active: true, contractEndsAt: new Date(Date.now() + 30 * DAY), seatLimit: 10 },
  });

const grantUrl = (orgId: string, courseId: string) => `/admin/organizations/${orgId}/courses/${courseId}`;

describe('Private курс зохиох (house teacher)', () => {
  it('house teacher биш багш PRIVATE курс үүсгэхэд 403; house teacher-т 201; PUBLIC хэвээр', async () => {
    const regular = await teacher('teacher@example.mn');
    const denied = await regular.agent.post('/teacher/courses').send({ title: 'Нууц', visibility: 'PRIVATE' }).expect(403);
    expect(denied.body.code).toBe('HOUSE_TEACHER_ONLY');
    await regular.agent.post('/teacher/courses').send({ title: 'Нийтийн', visibility: 'PUBLIC' }).expect(201);

    const house = await houseTeacher();
    const ok = await house.agent.post('/teacher/courses').send({ title: 'Нууц', visibility: 'PRIVATE' }).expect(201);
    expect(ok.body.visibility).toBe('PRIVATE');
  });

  it('/me нь isHouseTeacher-ийг зөвхөн house teacher-т true гэж өгнө', async () => {
    const house = await houseTeacher();
    const regular = await teacher('teacher@example.mn');
    expect((await house.agent.get('/me').expect(200)).body.isHouseTeacher).toBe(true);
    expect((await regular.agent.get('/me').expect(200)).body.isHouseTeacher).toBe(false);
  });
});

describe('Grant удирдлага — админ', () => {
  it('grant → гишүүн тэр дороо үзнэ; revoke → тэр дороо хаагдана; audit log үлдэнэ', async () => {
    const house = await houseTeacher();
    const adm = await admin();
    const c = await privateCourse(house.user.id);
    const company = await org();
    const member = await loginByEmail(t, 'member@example.mn');
    await t.prisma.organizationMember.create({ data: { organizationId: company.id, userId: member.user.id } });

    // grant-гүй: хаалттай
    await member.agent.get(`/catalog/lessons/${c.lessonId}`).expect(404);

    const granted = await adm.agent.post(grantUrl(company.id, c.id)).expect(200);
    expect(granted.body).toMatchObject({ courseId: c.id, status: 'PUBLISHED' });
    const open = await member.agent.get(`/catalog/lessons/${c.lessonId}`).expect(200);
    expect(open.body).toMatchObject({ access: 'ORG', content: { markdown: 'нууц агуулга' } });

    await adm.agent.delete(grantUrl(company.id, c.id)).expect(204);
    await member.agent.get(`/catalog/lessons/${c.lessonId}`).expect(404);

    const actions = (await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'org.course.' } }, orderBy: { createdAt: 'asc' } })).map((a) => [a.action, a.targetId, a.actorId]);
    expect(actions).toEqual([
      ['org.course.grant', company.id, adm.user.id],
      ['org.course.revoke', company.id, adm.user.id],
    ]);
  });

  it('grant idempotent: давтан дуудахад 200, нэг мөр, нэг audit', async () => {
    const house = await houseTeacher();
    const adm = await admin();
    const c = await privateCourse(house.user.id);
    const company = await org();

    const first = await adm.agent.post(grantUrl(company.id, c.id)).expect(200);
    const second = await adm.agent.post(grantUrl(company.id, c.id)).expect(200);
    expect(second.body.grantedAt).toBe(first.body.grantedAt);
    expect(await t.prisma.organizationCourseGrant.count()).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'org.course.grant' } })).toBe(1);

    // revoke ч idempotent, давхар audit бичихгүй
    await adm.agent.delete(grantUrl(company.id, c.id)).expect(204);
    await adm.agent.delete(grantUrl(company.id, c.id)).expect(204);
    expect(await t.prisma.auditLog.count({ where: { action: 'org.course.revoke' } })).toBe(1);
  });

  it('PUBLIC курсийг grant хийхэд 400; байхгүй курс/байгууллагад 404; grant үүсэхгүй', async () => {
    const house = await houseTeacher();
    const adm = await admin();
    const pub = await publicCourse(house.user.id);
    const c = await privateCourse(house.user.id);
    const company = await org();

    const res = await adm.agent.post(grantUrl(company.id, pub.id)).expect(400);
    expect(res.body.code).toBe('COURSE_NOT_PRIVATE');
    await adm.agent.post(grantUrl(company.id, NIL)).expect(404);
    await adm.agent.post(grantUrl(NIL, c.id)).expect(404);
    expect(await t.prisma.organizationCourseGrant.count()).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'org.course.' } } })).toBe(0);
  });

  it('жагсаалтууд: байгууллагын курсууд, курсийн байгууллагууд, private курсийн сонголт (PUBLIC орохгүй)', async () => {
    const house = await houseTeacher();
    const adm = await admin();
    const c1 = await privateCourse(house.user.id);
    const c2 = await privateCourse(house.user.id);
    await publicCourse(house.user.id);
    const a = await org();
    const b = await org();
    await adm.agent.post(grantUrl(a.id, c1.id)).expect(200);
    await adm.agent.post(grantUrl(a.id, c2.id)).expect(200);
    await adm.agent.post(grantUrl(b.id, c1.id)).expect(200);

    const forOrg = await adm.agent.get(`/admin/organizations/${a.id}/courses`).expect(200);
    expect(forOrg.body.map((r: { courseId: string }) => r.courseId).sort()).toEqual([c1.id, c2.id].sort());

    const forCourse = await adm.agent.get(`/admin/courses/${c1.id}/organizations`).expect(200);
    expect(forCourse.body.map((r: { organizationId: string }) => r.organizationId).sort()).toEqual([a.id, b.id].sort());
    expect((await adm.agent.get(`/admin/courses/${c2.id}/organizations`).expect(200)).body).toHaveLength(1);

    const options = await adm.agent.get('/admin/private-courses').expect(200);
    expect(options.body.map((r: { id: string }) => r.id).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('админ биш (суралцагч, багш, зочин, house teacher) бүх endpoint дээр 403/401', async () => {
    const house = await houseTeacher();
    const c = await privateCourse(house.user.id);
    const company = await org();
    const learner = await loginByEmail(t, 'learner@example.mn');
    const regular = await teacher('teacher@example.mn');

    for (const who of [learner, regular, house]) {
      await who.agent.post(grantUrl(company.id, c.id)).expect(403);
      await who.agent.delete(grantUrl(company.id, c.id)).expect(403);
      await who.agent.get(`/admin/organizations/${company.id}/courses`).expect(403);
      await who.agent.get(`/admin/courses/${c.id}/organizations`).expect(403);
      await who.agent.get('/admin/private-courses').expect(403);
    }
    await t.http().post(grantUrl(company.id, c.id)).expect(401);
    await t.http().get('/admin/private-courses').expect(401);
    expect(await t.prisma.organizationCourseGrant.count()).toBe(0);
  });
});
