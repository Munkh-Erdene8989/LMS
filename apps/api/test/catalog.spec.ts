import { grantRoleByIdentifier } from '../src/admin/roles';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Урт сценари + алслагдсан dev DB (Supabase, ap-south-1) — хүсэлт бүр ~200мс.
jest.setTimeout(180_000);

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

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

async function category(a: Agent) {
  const tree = (await a.post('/admin/categories').send({ name: 'Програмчлал' }).expect(201)).body;
  return tree[0].id as string;
}

/** Шалгуулахад бэлэн курс: зураг, ангилал, үнэ, 1 бүлэг, текст + PDF хичээл. */
async function readyCourse(teacherAgent: Agent, categoryId: string) {
  const course = (await teacherAgent.post('/teacher/courses').send({ title: 'JavaScript анхан шат' }).expect(201)).body;
  const id = course.id as string;

  const cover = (await teacherAgent.post(`/teacher/courses/${id}/cover-upload`).send({ contentType: 'image/png' }).expect(201)).body;
  t.storage.put('public', cover.key, { size: 200_000, contentType: 'image/png' });
  await teacherAgent
    .patch(`/teacher/courses/${id}`)
    .send({ description: 'Эхнээс нь заана', categoryId, level: 'BEGINNER', priceCredits: 15, coverKey: cover.key })
    .expect(200);

  let detail = (await teacherAgent.post(`/teacher/courses/${id}/sections`).send({ title: '1. Танилцуулга' }).expect(201)).body;
  const sectionId = detail.sections[0].id as string;
  await teacherAgent.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Хувьсагч', type: 'TEXT' }).expect(201);
  detail = (await teacherAgent.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Гарын авлага', type: 'PDF' }).expect(201)).body;
  const [textLesson, pdfLesson] = detail.sections[0].lessons;

  await teacherAgent
    .patch(`/teacher/lessons/${textLesson.id}`)
    .send({ priceCredits: 10, isFreePreview: true, content: { markdown: '# Хувьсагч\n`let x = 1`' } })
    .expect(200);
  const upload = (await teacherAgent.post(`/teacher/lessons/${pdfLesson.id}/pdf-upload`).expect(201)).body;
  t.storage.put('private', upload.key, { size: 1_000_000, contentType: 'application/pdf' });
  detail = (
    await teacherAgent
      .patch(`/teacher/lessons/${pdfLesson.id}`)
      .send({ priceCredits: 8, content: { fileKey: upload.key, fileName: 'guide.pdf' } })
      .expect(200)
  ).body;
  return { id, sectionId, textLessonId: textLesson.id as string, pdfLessonId: pdfLesson.id as string, detail };
}

describe('Эрх', () => {
  it('багш биш хэрэглэгч курс үүсгэх боломжгүй; нэвтрээгүй 401', async () => {
    const learner = await loginByEmail(t, 'learner@example.mn');
    await learner.agent.post('/teacher/courses').send({ title: 'x' }).expect(403);
    await learner.agent.get('/teacher/courses').expect(403);
    await t.http().get('/teacher/courses').expect(401);
  });

  it('зөвхөн өөрийн курсийг харж, засна — бусдынх 404', async () => {
    const a = await admin();
    const cat = await category(a.agent);
    const owner = await teacher('owner@example.mn');
    const other = await teacher('other@example.mn');
    const c = await readyCourse(owner.agent, cat);

    await other.agent.get(`/teacher/courses/${c.id}`).expect(404);
    await other.agent.patch(`/teacher/courses/${c.id}`).send({ title: 'hacked' }).expect(404);
    await other.agent.delete(`/teacher/courses/${c.id}`).expect(404);
    await other.agent.post(`/teacher/courses/${c.id}/sections`).send({ title: 'x' }).expect(404);
    await other.agent.patch(`/teacher/sections/${c.sectionId}`).send({ title: 'x' }).expect(404);
    await other.agent.post(`/teacher/sections/${c.sectionId}/lessons`).send({ title: 'x', type: 'TEXT' }).expect(404);
    await other.agent.patch(`/teacher/lessons/${c.textLessonId}`).send({ title: 'x' }).expect(404);
    await other.agent.delete(`/teacher/lessons/${c.textLessonId}`).expect(404);
    await other.agent.post(`/teacher/lessons/${c.pdfLessonId}/pdf-upload`).expect(404);
    await other.agent.post(`/teacher/courses/${c.id}/submit`).expect(404);
    expect((await other.agent.get('/teacher/courses').expect(200)).body).toEqual([]);

    const fresh = (await owner.agent.get(`/teacher/courses/${c.id}`).expect(200)).body;
    expect(fresh.title).toBe('JavaScript анхан шат');
  });

  it('админы шалгалтын endpoint-д багш хандах боломжгүй', async () => {
    const tch = await teacher();
    await tch.agent.get('/admin/course-reviews').expect(403);
    await tch.agent.post('/admin/categories').send({ name: 'x' }).expect(403);
  });
});

describe('Курс засварлах', () => {
  it('бэлэн курсийн мэдээлэл, үнэ, preview, агуулга зөв харагдана', async () => {
    const a = await admin();
    const c = await readyCourse((await teacher()).agent, await category(a.agent));
    expect(c.detail).toMatchObject({
      status: 'DRAFT',
      level: 'BEGINNER',
      priceCredits: 15,
      lessonsTotalCredits: 18,
      problems: [],
      coverUrl: expect.stringContaining('https://fake-storage.test/public/courses/'),
    });
    const [text, pdf] = c.detail.sections[0].lessons;
    expect(text).toMatchObject({ type: 'TEXT', priceCredits: 10, isFreePreview: true, reviewStatus: 'DRAFT', problems: [] });
    expect(text.content).toEqual({ type: 'TEXT', markdown: '# Хувьсагч\n`let x = 1`' });
    expect(pdf.content).toMatchObject({ type: 'PDF', fileName: 'guide.pdf', size: 1_000_000, url: expect.stringContaining('/signed/private/lessons/') });
  });

  it('дутуу курсийг илгээхэд 400 NOT_READY, дутуу зүйлсийг жагсаана', async () => {
    const tch = await teacher();
    const course = (await tch.agent.post('/teacher/courses').send({ title: 'Хоосон' }).expect(201)).body;
    expect(course.problems).toEqual(
      expect.arrayContaining(['Курсийн тайлбар хоосон', 'Ангилал сонгоогүй', 'Курсийн зураг оруулаагүй', 'Дор хаяж нэг хичээл нэмнэ үү']),
    );
    const res = await tch.agent.post(`/teacher/courses/${course.id}/submit`).expect(400);
    expect(res.body.code).toBe('NOT_READY');
    expect((await t.prisma.course.findUniqueOrThrow({ where: { id: course.id } })).status).toBe('DRAFT');
  });

  it('курсийн бүтэн үнэ хичээлүүдийн нийлбэрээс их байж болохгүй', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));
    const d = (await tch.agent.patch(`/teacher/courses/${c.id}`).send({ priceCredits: 19 }).expect(200)).body;
    expect(d.problems).toContain('Курсийн бүтэн үнэ хичээлүүдийн нийт үнээс их байна');
    await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(400);
  });

  it('upload хийгээгүй, буруу төрлийн, өөр замын файл хүлээн авахгүй', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));

    const up = (await tch.agent.post(`/teacher/lessons/${c.pdfLessonId}/pdf-upload`).expect(201)).body;
    let res = await tch.agent.patch(`/teacher/lessons/${c.pdfLessonId}`).send({ content: { fileKey: up.key, fileName: 'a.pdf' } }).expect(400);
    expect(res.body.code).toBe('INVALID_UPLOAD'); // upload хийгдээгүй

    t.storage.put('private', up.key, { size: 1000, contentType: 'application/zip' });
    await tch.agent.patch(`/teacher/lessons/${c.pdfLessonId}`).send({ content: { fileKey: up.key, fileName: 'a.pdf' } }).expect(400);

    t.storage.put('private', up.key, { size: 60 * 1024 * 1024, contentType: 'application/pdf' });
    await tch.agent.patch(`/teacher/lessons/${c.pdfLessonId}`).send({ content: { fileKey: up.key, fileName: 'a.pdf' } }).expect(400);

    // өөр lesson-ы замыг ашиглах оролдлого
    t.storage.put('private', `lessons/${c.textLessonId}/x.pdf`, { size: 1000, contentType: 'application/pdf' });
    res = await tch.agent
      .patch(`/teacher/lessons/${c.pdfLessonId}`)
      .send({ content: { fileKey: `lessons/${c.textLessonId}/x.pdf`, fileName: 'a.pdf' } })
      .expect(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');

    // зураг: зөвхөн image төрөл
    await tch.agent.post(`/teacher/courses/${c.id}/cover-upload`).send({ contentType: 'application/pdf' }).expect(400);
    // текст хичээлд PDF агуулга
    res = await tch.agent.patch(`/teacher/lessons/${c.textLessonId}`).send({ content: { fileKey: up.key, fileName: 'a.pdf' } }).expect(400);
    expect(res.body.code).toBe('CONTENT_TYPE_MISMATCH');
  });

  it('дэмжигдээгүй төрлийн хичээл үүсгэх боломжгүй (видео дараагийн ticket-д)', async () => {
    const tch = await teacher();
    const course = (await tch.agent.post('/teacher/courses').send({ title: 'x' })).body;
    const d = (await tch.agent.post(`/teacher/courses/${course.id}/sections`).send({ title: 's' })).body;
    const res = await tch.agent.post(`/teacher/sections/${d.sections[0].id}/lessons`).send({ title: 'v', type: 'VIDEO' }).expect(400);
    expect(res.body.code).toBe('LESSON_TYPE_UNAVAILABLE');
  });

  it('бүлэг, хичээлийн дарааллыг өөрчилж, хичээлийг бүлэг хооронд зөөнө', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));
    const d = (await tch.agent.post(`/teacher/courses/${c.id}/sections`).send({ title: '2. Гүнзгий' }).expect(201)).body;
    const s2 = d.sections[1].id;

    const res = await tch.agent
      .put(`/teacher/courses/${c.id}/curriculum`)
      .send({ sections: [{ id: s2, lessonIds: [c.pdfLessonId] }, { id: c.sectionId, lessonIds: [c.textLessonId] }] })
      .expect(200);
    expect(res.body.sections.map((s: { title: string; lessons: { id: string }[] }) => [s.title, s.lessons.map((l) => l.id)])).toEqual([
      ['2. Гүнзгий', [c.pdfLessonId]],
      ['1. Танилцуулга', [c.textLessonId]],
    ]);

    // хичээл дутуу эсвэл илүү бол татгалзана
    await tch.agent
      .put(`/teacher/courses/${c.id}/curriculum`)
      .send({ sections: [{ id: s2, lessonIds: [] }, { id: c.sectionId, lessonIds: [c.textLessonId] }] })
      .expect(400);
  });

  it('хоосон бус бүлгийг устгахгүй; DRAFT курс бүхэлдээ устгагдана', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));
    const res = await tch.agent.delete(`/teacher/sections/${c.sectionId}`).expect(409);
    expect(res.body.code).toBe('SECTION_NOT_EMPTY');
    await tch.agent.delete(`/teacher/courses/${c.id}`).expect(204);
    expect(await t.prisma.lesson.count()).toBe(0);
  });
});

describe('Шалгалтын төлөв: draft → in_review → published / rejected', () => {
  it('илгээхэд IN_REVIEW, засах түгжигдэнэ; админ буцаахад REJECTED + шалтгаан, засаад дахин илгээж нийтлэгдэнэ', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));

    const submitted = (await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(200)).body;
    expect(submitted.status).toBe('IN_REVIEW');
    expect(submitted.sections[0].lessons.every((l: { reviewStatus: string }) => l.reviewStatus === 'IN_REVIEW')).toBe(true);

    // шалгагдаж байхад засах боломжгүй
    expect((await tch.agent.patch(`/teacher/courses/${c.id}`).send({ title: 'x' }).expect(409)).body.code).toBe('COURSE_IN_REVIEW');
    await tch.agent.patch(`/teacher/lessons/${c.textLessonId}`).send({ title: 'x' }).expect(409);
    await tch.agent.post(`/teacher/courses/${c.id}/sections`).send({ title: 'x' }).expect(409);
    await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(409);
    await tch.agent.delete(`/teacher/courses/${c.id}`).expect(409);

    // дараалалд, бүх агуулгатай (PDF signed URL)
    const queue = (await a.agent.get('/admin/course-reviews').expect(200)).body;
    expect(queue).toEqual([expect.objectContaining({ kind: 'COURSE', course: expect.objectContaining({ id: c.id, lessonCount: 2 }) })]);
    const preview = (await a.agent.get(`/admin/courses/${c.id}`).expect(200)).body;
    expect(preview.sections[0].lessons[1].content.url).toContain('/signed/private/');

    await a.agent.post(`/admin/courses/${c.id}/reject`).send({ reason: '' }).expect(400);
    const rejected = (await a.agent.post(`/admin/courses/${c.id}/reject`).send({ reason: 'Тайлбар хэт богино' }).expect(200)).body;
    expect(rejected).toMatchObject({ status: 'REJECTED', reviewNote: 'Тайлбар хэт богино' });

    const bell = (await tch.agent.get('/notifications')).body.items;
    expect(bell[0]).toMatchObject({ type: 'COURSE_REJECTED', body: expect.stringContaining('Тайлбар хэт богино') });

    // засаад дахин илгээх
    await tch.agent.patch(`/teacher/courses/${c.id}`).send({ description: 'Дэлгэрэнгүй тайлбар...' }).expect(200);
    const resubmitted = (await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(200)).body;
    expect(resubmitted).toMatchObject({ status: 'IN_REVIEW', reviewNote: null });

    const published = (await a.agent.post(`/admin/courses/${c.id}/approve`).expect(200)).body;
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedAt: expect.any(String) });
    expect(published.sections[0].lessons.every((l: { reviewStatus: string }) => l.reviewStatus === 'APPROVED')).toBe(true);
    expect((await tch.agent.get('/notifications')).body.items[0].type).toBe('COURSE_APPROVED');
    expect((await a.agent.get('/admin/course-reviews')).body).toEqual([]);

    const actions = (await t.prisma.auditLog.findMany({ where: { targetType: 'course' }, orderBy: { createdAt: 'asc' } })).map((x) => x.action);
    expect(actions).toEqual(['course.reject', 'course.approve']);

    // давхар шийдвэр
    await a.agent.post(`/admin/courses/${c.id}/approve`).expect(409);
  });

  it('нийтлэгдсэн курсийн шинэ хичээл тусдаа шалгагдаж, хуучин хичээлүүд APPROVED хэвээр', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));
    await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(200);
    await a.agent.post(`/admin/courses/${c.id}/approve`).expect(200);

    // шинэ хичээлгүй бол илгээх зүйлгүй
    expect((await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(409)).body.code).toBe('NOTHING_TO_SUBMIT');

    let d = (await tch.agent.post(`/teacher/sections/${c.sectionId}/lessons`).send({ title: 'Функц', type: 'TEXT' }).expect(201)).body;
    const newLesson = d.sections[0].lessons[2];
    expect(newLesson.reviewStatus).toBe('DRAFT');
    // дутуу (хоосон текст) хичээл илгээх боломжгүй
    await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(400);
    await tch.agent.patch(`/teacher/lessons/${newLesson.id}`).send({ priceCredits: 5, content: { markdown: 'function f() {}' } }).expect(200);

    d = (await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(200)).body;
    expect(d.status).toBe('PUBLISHED'); // курс нийтлэгдсэн хэвээр
    expect(d.sections[0].lessons.map((l: { reviewStatus: string }) => l.reviewStatus)).toEqual(['APPROVED', 'APPROVED', 'IN_REVIEW']);

    const queue = (await a.agent.get('/admin/course-reviews')).body;
    expect(queue).toEqual([expect.objectContaining({ kind: 'LESSONS', course: expect.objectContaining({ pendingLessonCount: 1 }) })]);

    // буцаах → зөвхөн шинэ хичээл REJECTED
    d = (await a.agent.post(`/admin/lessons/${newLesson.id}/reject`).send({ reason: 'Жишээ нэмнэ үү' }).expect(200)).body;
    expect(d.status).toBe('PUBLISHED');
    expect(d.sections[0].lessons.map((l: { reviewStatus: string }) => l.reviewStatus)).toEqual(['APPROVED', 'APPROVED', 'REJECTED']);
    expect((await tch.agent.get('/notifications')).body.items[0].type).toBe('LESSONS_REJECTED');

    // засаад дахин → зөвшөөрөгдөнө
    await tch.agent.patch(`/teacher/lessons/${newLesson.id}`).send({ content: { markdown: 'function f() { return 1 }' } }).expect(200);
    await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(200);
    d = (await a.agent.post(`/admin/courses/${c.id}/approve`).expect(200)).body;
    expect(d.sections[0].lessons.map((l: { reviewStatus: string }) => l.reviewStatus)).toEqual(['APPROVED', 'APPROVED', 'APPROVED']);
    expect((await tch.agent.get('/notifications')).body.items[0]).toMatchObject({ type: 'LESSONS_APPROVED' });
  });

  it('нийтлэгдсэн хичээлийн агуулга түгжигдэж, устгавал архивлагдана; гарчиг, үнэ засагдана', async () => {
    const a = await admin();
    const tch = await teacher();
    const c = await readyCourse(tch.agent, await category(a.agent));
    await tch.agent.post(`/teacher/courses/${c.id}/submit`).expect(200);
    await a.agent.post(`/admin/courses/${c.id}/approve`).expect(200);

    const res = await tch.agent.patch(`/teacher/lessons/${c.textLessonId}`).send({ content: { markdown: 'өөрчилсөн' } }).expect(409);
    expect(res.body.code).toBe('LESSON_CONTENT_LOCKED');
    await tch.agent.post(`/teacher/lessons/${c.pdfLessonId}/pdf-upload`).expect(409);

    const d = (await tch.agent.patch(`/teacher/lessons/${c.textLessonId}`).send({ title: 'Хувьсагч (шинэчилсэн)', priceCredits: 12 }).expect(200)).body;
    expect(d.sections[0].lessons[0]).toMatchObject({ title: 'Хувьсагч (шинэчилсэн)', priceCredits: 12, reviewStatus: 'APPROVED' });

    await tch.agent.delete(`/teacher/lessons/${c.pdfLessonId}`).expect(200);
    const row = await t.prisma.lesson.findUniqueOrThrow({ where: { id: c.pdfLessonId } });
    expect(row.archivedAt).not.toBeNull(); // DB-д үлдэнэ — худалдан авсан хүмүүст хэрэгтэй
    expect(row.reviewStatus).toBe('APPROVED');
    await tch.agent.patch(`/teacher/lessons/${c.pdfLessonId}`).send({ title: 'x' }).expect(404);
    await tch.agent.delete(`/teacher/courses/${c.id}`).expect(409); // нийтлэгдсэн курс устахгүй
  });
});

describe('Ангилал', () => {
  it('2 түвшин, нийтэд мод хэлбэрээр; 3-р түвшин, ашиглагдаж буйг устгахгүй; audit', async () => {
    const a = await admin();
    let tree = (await a.agent.post('/admin/categories').send({ name: 'Програмчлал' }).expect(201)).body;
    const root = tree[0];
    expect(root.slug).toBe('programchlal');
    tree = (await a.agent.post('/admin/categories').send({ name: 'Вэб хөгжүүлэлт', parentId: root.id }).expect(201)).body;
    const child = tree[0].children[0];
    expect(child).toMatchObject({ name: 'Вэб хөгжүүлэлт', slug: 'veb-khugjuulelt' });

    const res = await a.agent.post('/admin/categories').send({ name: 'Гүн', parentId: child.id }).expect(400);
    expect(res.body.code).toBe('CATEGORY_DEPTH');

    expect((await t.http().get('/categories').expect(200)).body).toEqual(tree);

    await a.agent.delete(`/admin/categories/${root.id}`).expect(409); // дэд ангилалтай
    const tch = await teacher();
    const course = (await tch.agent.post('/teacher/courses').send({ title: 'x' })).body;
    await tch.agent.patch(`/teacher/courses/${course.id}`).send({ categoryId: child.id }).expect(200);
    await a.agent.delete(`/admin/categories/${child.id}`).expect(409); // курстэй

    await a.agent.patch(`/admin/categories/${root.id}`).send({ name: 'IT' }).expect(200);
    const actions = (await t.prisma.auditLog.findMany({ where: { targetType: 'category' } })).map((x) => x.action).sort();
    expect(actions).toEqual(['category.create', 'category.create', 'category.update']);
  });
});
