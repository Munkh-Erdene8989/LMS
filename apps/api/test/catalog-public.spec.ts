import type { CourseLevel, CourseStatus, LessonReviewStatus, LessonType } from '@lms/db';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан dev DB (Supabase, ap-south-1) — хүсэлт бүр ~200мс.
jest.setTimeout(180_000);

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

// ---------------------------------------------------------------------------
// Fixture-ууд: каталогийн тестэд курсийг DB-д шууд үүсгэнэ (зохиох/шалгах урсгал catalog.spec.ts-д,
// энд нэг end-to-end тест бий). Шалгалт бүгд HTTP-ээр.
// ---------------------------------------------------------------------------

let seq = 0;

async function teacherUser(name: string | null, displayName?: string) {
  const user = await t.prisma.user.create({ data: { name, roles: ['LEARNER', 'TEACHER'] } });
  if (displayName) {
    const doc = await t.prisma.legalDocument.upsert({
      where: { type_version: { type: 'TEACHER_AGREEMENT', version: 1 } },
      update: {},
      create: { type: 'TEACHER_AGREEMENT', version: 1, title: 'Гэрээ', body: '...', publishedAt: new Date() },
    });
    const acceptance = await t.prisma.legalAcceptance.create({ data: { userId: user.id, documentId: doc.id } });
    await t.prisma.teacherApplication.create({
      data: {
        userId: user.id,
        status: 'APPROVED',
        displayName,
        bio: `${displayName} — туршлагатай багш`,
        expertise: 'Програм хангамж',
        sampleUrl: 'https://example.mn',
        agreementAcceptanceId: acceptance.id,
        submittedAt: new Date(),
      },
    });
  }
  return user;
}

async function categoryRow(name: string, slug: string, parentId: string | null = null) {
  return t.prisma.category.create({ data: { name, slug, parentId } });
}

interface LessonSpec {
  title?: string;
  type?: LessonType;
  price?: number;
  preview?: boolean;
  status?: LessonReviewStatus;
  archived?: boolean;
  content?: object;
}

async function courseRow(opts: {
  teacherId: string;
  title: string;
  description?: string;
  categoryId?: string | null;
  level?: CourseLevel;
  price?: number;
  status?: CourseStatus;
  lessons?: LessonSpec[];
}) {
  const status = opts.status ?? 'PUBLISHED';
  const course = await t.prisma.course.create({
    data: {
      teacherId: opts.teacherId,
      title: opts.title,
      description: opts.description ?? 'Тайлбар',
      categoryId: opts.categoryId ?? null,
      level: opts.level ?? 'ALL',
      priceCredits: opts.price ?? 10,
      coverKey: `courses/${++seq}/cover.png`,
      status,
      publishedAt: status === 'PUBLISHED' ? new Date(Date.now() + seq * 1000) : null,
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const lessons = opts.lessons ?? [{}];
  const ids: string[] = [];
  for (const [i, l] of lessons.entries()) {
    const type = l.type ?? 'TEXT';
    const row = await t.prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: course.sections[0]!.id,
        title: l.title ?? `Хичээл ${i + 1}`,
        type,
        position: i,
        priceCredits: l.price ?? 5,
        isFreePreview: l.preview ?? false,
        reviewStatus: l.status ?? (status === 'PUBLISHED' ? 'APPROVED' : 'DRAFT'),
        archivedAt: l.archived ? new Date() : null,
        content: l.content ?? (type === 'TEXT' ? { markdown: `Нууц агуулга ${i + 1}` } : { fileKey: `lessons/${seq}/${i}.pdf`, fileName: 'a.pdf', size: 1000 }),
      },
    });
    ids.push(row.id);
  }
  return { id: course.id, lessonIds: ids };
}

const titles = (body: { items: { title: string }[] }) => body.items.map((c) => c.title).sort();

// ---------------------------------------------------------------------------

describe('Нийтлэгдээгүй контент нийтэд харагдахгүй', () => {
  beforeAll(() => t.reset());

  it('draft / in-review / rejected курс каталог, хайлт, дэлгэрэнгүй, багшийн profile-д гарахгүй', async () => {
    const tch = await teacherUser('Бат');
    const published = await courseRow({ teacherId: tch.id, title: 'Нийтлэгдсэн курс' });
    const hidden = [];
    for (const status of ['DRAFT', 'IN_REVIEW', 'REJECTED'] as const) {
      hidden.push(await courseRow({ teacherId: tch.id, title: `Хаалттай сэдэв ${status}`, status, lessons: [{ preview: true }] }));
    }

    const list = (await t.http().get('/catalog/courses').expect(200)).body;
    expect(titles(list)).toEqual(['Нийтлэгдсэн курс']);
    expect(list.total).toBe(1);
    expect((await t.http().get('/catalog/courses').query({ q: 'Хаалттай сэдэв' }).expect(200)).body.items).toEqual([]);

    for (const h of hidden) {
      expect((await t.http().get(`/catalog/courses/${h.id}`).expect(404)).body.code).toBe('NOT_FOUND');
      await t.http().get(`/catalog/lessons/${h.lessonIds[0]}`).expect(404); // free preview ч гэсэн
    }
    await t.http().get(`/catalog/courses/${published.id}`).expect(200);

    const profile = (await t.http().get(`/catalog/teachers/${tch.id}`).expect(200)).body;
    expect(profile.courses.map((c: { title: string }) => c.title)).toEqual(['Нийтлэгдсэн курс']);
  });

  it('шалгагдаагүй / буцаагдсан / архивласан lesson curriculum-д ч, контент endpoint-д ч гарахгүй', async () => {
    const tch = await teacherUser('Дорж');
    const c = await courseRow({
      teacherId: tch.id,
      title: 'Lesson шүүлт',
      lessons: [
        { title: 'Зөвшөөрөгдсөн', preview: true },
        { title: 'Шалгагдаж буй', status: 'IN_REVIEW', preview: true },
        { title: 'Ноорог', status: 'DRAFT', preview: true },
        { title: 'Буцаагдсан', status: 'REJECTED', preview: true },
        { title: 'Архивласан', archived: true, preview: true },
      ],
    });
    const detail = (await t.http().get(`/catalog/courses/${c.id}`).expect(200)).body;
    const lessons = detail.sections.flatMap((s: { lessons: { title: string }[] }) => s.lessons);
    expect(lessons.map((l: { title: string }) => l.title)).toEqual(['Зөвшөөрөгдсөн']);
    expect(detail.lessonCount).toBe(1);
    expect(detail.pricing.lessonsTotalCredits).toBe(5);

    await t.http().get(`/catalog/lessons/${c.lessonIds[0]}`).expect(200);
    for (const id of c.lessonIds.slice(1)) await t.http().get(`/catalog/lessons/${id}`).expect(404);
  });

  it('багш биш хэрэглэгчийн profile 404', async () => {
    const learner = await t.prisma.user.create({ data: { name: 'Суралцагч' } });
    await t.http().get(`/catalog/teachers/${learner.id}`).expect(404);
    await t.http().get('/catalog/teachers/not-a-uuid').expect(400);
  });
});

describe('Курсийн хуудас ба free preview', () => {
  beforeAll(() => t.reset());

  it('curriculum, үнэ, багш, ангиллыг нэвтрэлтгүй харуулна; контент зөвхөн free preview-д', async () => {
    const tch = await teacherUser('Хэрэглэгчийн нэр', 'Б. Болд');
    const parent = await categoryRow('Програмчлал', 'programchlal');
    const child = await categoryRow('Веб', 'web', parent.id);
    const c = await courseRow({
      teacherId: tch.id,
      title: 'JavaScript',
      description: '# Тайлбар\nДэлгэрэнгүй',
      categoryId: child.id,
      level: 'BEGINNER',
      price: 12,
      lessons: [
        { title: 'Танилцуулга', preview: true, price: 0, content: { markdown: '# Сайн уу' } },
        { title: 'Гарын авлага', type: 'PDF', preview: true, price: 4 },
        { title: 'Төлбөртэй текст', price: 6 },
        { title: 'Төлбөртэй PDF', type: 'PDF', price: 5 },
      ],
    });

    const detail = (await t.http().get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(detail).toMatchObject({
      id: c.id,
      title: 'JavaScript',
      description: '# Тайлбар\nДэлгэрэнгүй',
      level: 'BEGINNER',
      priceCredits: 12,
      hasFreePreview: true,
      lessonCount: 4,
      coverUrl: expect.stringContaining('https://fake-storage.test/public/courses/'),
      teacher: { id: tch.id, name: 'Б. Болд', bio: 'Б. Болд — туршлагатай багш', avatarUrl: null },
      category: { slug: 'web', name: 'Веб', parent: { slug: 'programchlal', name: 'Програмчлал' } },
      rating: { average: null, count: 0 },
      pricing: { listCredits: 12, lessonsTotalCredits: 15, payableCredits: 12 },
    });
    expect(detail.sections[0].lessons).toEqual([
      { id: c.lessonIds[0], title: 'Танилцуулга', type: 'TEXT', priceCredits: 0, isFreePreview: true, live: null },
      { id: c.lessonIds[1], title: 'Гарын авлага', type: 'PDF', priceCredits: 4, isFreePreview: true, live: null },
      { id: c.lessonIds[2], title: 'Төлбөртэй текст', type: 'TEXT', priceCredits: 6, isFreePreview: false, live: null },
      { id: c.lessonIds[3], title: 'Төлбөртэй PDF', type: 'PDF', priceCredits: 5, isFreePreview: false, live: null },
    ]);
    // Дэлгэрэнгүйд ямар ч lesson-ы контент (markdown, файлын түлхүүр) байхгүй
    const raw = JSON.stringify(detail);
    expect(raw).not.toContain('Нууц агуулга');
    expect(raw).not.toContain('Сайн уу');
    expect(raw).not.toContain('lessons/');
    expect(raw).not.toContain('reviewStatus');

    // Free preview: нэвтрээгүй ч контент
    const text = (await t.http().get(`/catalog/lessons/${c.lessonIds[0]}`).expect(200)).body;
    expect(text).toMatchObject({ course: { id: c.id, title: 'JavaScript' }, content: { type: 'TEXT', markdown: '# Сайн уу' } });
    const pdf = (await t.http().get(`/catalog/lessons/${c.lessonIds[1]}`).expect(200)).body;
    expect(pdf.content).toMatchObject({ type: 'PDF', fileName: 'a.pdf', url: expect.stringContaining('/signed/private/lessons/') });
    expect(pdf.content.url).toContain('expiresIn=300');

    // Төлбөртэй lesson: 403, контент огт буцахгүй
    for (const id of c.lessonIds.slice(2)) {
      const res = await t.http().get(`/catalog/lessons/${id}`).expect(403);
      expect(res.body.code).toBe('LESSON_LOCKED');
      expect(JSON.stringify(res.body)).not.toMatch(/Нууц агуулга|signed|lessons\//);
    }
    // Нэвтэрсэн ч (худалдаж аваагүй) — мөн 403
    const learner = await loginByEmail(t, 'learner@example.mn');
    await learner.agent.get(`/catalog/lessons/${c.lessonIds[2]}`).expect(403);
  });

  it('багшийн profile: нийтийн нэр, bio, зөвхөн нийтлэгдсэн курсууд', async () => {
    const tch = await teacherUser('Жинхэнэ нэр', 'Сараа багш');
    await courseRow({ teacherId: tch.id, title: 'Нэгдүгээр' });
    await courseRow({ teacherId: tch.id, title: 'Хоёрдугаар' });
    await courseRow({ teacherId: tch.id, title: 'Ноорог', status: 'DRAFT' });
    const noApp = await teacherUser('Энгийн нэр');

    const profile = (await t.http().get(`/catalog/teachers/${tch.id}`).expect(200)).body;
    expect(profile).toMatchObject({ id: tch.id, name: 'Сараа багш', bio: 'Сараа багш — туршлагатай багш', expertise: 'Програм хангамж' });
    expect(profile.courses.map((c: { title: string }) => c.title)).toEqual(['Хоёрдугаар', 'Нэгдүгээр']); // шинэ нь эхэнд
    expect(profile.courses[0].teacher.name).toBe('Сараа багш');

    const plain = (await t.http().get(`/catalog/teachers/${noApp.id}`).expect(200)).body;
    expect(plain).toMatchObject({ name: 'Энгийн нэр', bio: null, courses: [] });
  });
});

describe('Шүүлтүүр, ангилал, хайлт', () => {
  let parentSlug: string;

  beforeAll(async () => {
    await t.reset();
    const bold = await teacherUser('Болд', 'Бат-Эрдэнэ Болд');
    const saraa = await teacherUser('Сараа');
    const prog = await categoryRow('Програмчлал', 'programchlal');
    const web = await categoryRow('Веб хөгжүүлэлт', 'web', prog.id);
    const data = await categoryRow('Өгөгдөл', 'ogogdol', prog.id);
    const design = await categoryRow('Дизайн', 'dizain');
    parentSlug = prog.slug;

    await courseRow({
      teacherId: bold.id,
      title: 'Програмчлалын үндэс',
      description: 'Эхлэгчдэд зориулсан',
      categoryId: prog.id,
      level: 'BEGINNER',
      price: 10,
      lessons: [{ preview: true }],
    });
    await courseRow({
      teacherId: bold.id,
      title: 'React ба Next.js',
      description: 'Орчин үеийн вэб програмчлал',
      categoryId: web.id,
      level: 'INTERMEDIATE',
      price: 30,
    });
    await courseRow({
      teacherId: saraa.id,
      title: 'Python өгөгдлийн шинжилгээ',
      description: 'pandas, numpy',
      categoryId: data.id,
      level: 'ADVANCED',
      price: 50,
      lessons: [{ preview: true, status: 'IN_REVIEW' }, { preview: true, archived: true }, {}],
    });
    await courseRow({
      teacherId: saraa.id,
      title: 'Figma анхан шат',
      description: 'График дизайн',
      categoryId: design.id,
      level: 'BEGINNER',
      price: 20,
      lessons: [{ preview: true }],
    });
  });

  const list = async (query: Record<string, string | number>) =>
    (await t.http().get('/catalog/courses').query(query).expect(200)).body;

  it('анхдагч: шинэ нь эхэнд, карт бүрэн мэдээлэлтэй', async () => {
    const body = await list({});
    expect(body).toMatchObject({ total: 4, page: 1, pageSize: 12 });
    expect(body.items.map((c: { title: string }) => c.title)).toEqual([
      'Figma анхан шат',
      'Python өгөгдлийн шинжилгээ',
      'React ба Next.js',
      'Програмчлалын үндэс',
    ]);
    expect(body.items[3]).toMatchObject({
      level: 'BEGINNER',
      priceCredits: 10,
      lessonCount: 1,
      hasFreePreview: true,
      excerpt: 'Эхлэгчдэд зориулсан',
      teacher: { name: 'Бат-Эрдэнэ Болд' },
      category: { slug: 'programchlal', parent: null },
      rating: { average: null, count: 0 },
    });
  });

  it('үндсэн ангилал дэд ангиллуудынхаа курсийг агуулна; дэд ангилал зөвхөн өөрийнхийг', async () => {
    expect(titles(await list({ category: parentSlug }))).toEqual([
      'Python өгөгдлийн шинжилгээ',
      'React ба Next.js',
      'Програмчлалын үндэс',
    ]);
    expect(titles(await list({ category: 'web' }))).toEqual(['React ба Next.js']);
    expect(titles(await list({ category: 'dizain' }))).toEqual(['Figma анхан шат']);
    expect(await list({ category: 'baihgui' })).toMatchObject({ items: [], total: 0 });
  });

  it('үнэ, түвшин, free preview шүүлтүүр; үнэлгээ (review-гүй үед юу ч олдохгүй)', async () => {
    expect(titles(await list({ minPrice: 20, maxPrice: 30 }))).toEqual(['Figma анхан шат', 'React ба Next.js']);
    expect(titles(await list({ level: 'BEGINNER' }))).toEqual(['Figma анхан шат', 'Програмчлалын үндэс']);
    // Python-ы preview lesson-ууд шалгагдаагүй / архивласан тул тооцогдохгүй
    expect(titles(await list({ freePreview: 'true' }))).toEqual(['Figma анхан шат', 'Програмчлалын үндэс']);
    expect(titles(await list({ freePreview: 1, level: 'BEGINNER', category: parentSlug }))).toEqual(['Програмчлалын үндэс']);
    expect((await list({ minRating: 4 })).total).toBe(0);
    expect((await list({ sort: 'rating' })).total).toBe(4);
    // Буруу утгыг үл тооно
    expect((await list({ level: 'EXPERT', minPrice: 'abc', sort: 'x' })).total).toBe(4);
  });

  it('үнээр эрэмбэлэх, хуудаслах', async () => {
    expect((await list({ sort: 'price_asc' })).items.map((c: { priceCredits: number }) => c.priceCredits)).toEqual([10, 20, 30, 50]);
    expect((await list({ sort: 'price_desc' })).items.map((c: { priceCredits: number }) => c.priceCredits)).toEqual([50, 30, 20, 10]);
    const p2 = await list({ sort: 'price_asc', pageSize: 3, page: 2 });
    expect(p2).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(p2.items.map((c: { priceCredits: number }) => c.priceCredits)).toEqual([50]);
    expect(await list({ page: 9 })).toMatchObject({ items: [], total: 4 });
  });

  it('алдаатай бичсэн кирилл үгээр олно (гарчиг, тайлбар, багшийн нэр)', async () => {
    // "прогрмчлал" (а үсэг дутуу) → "Програмчлалын үндэс" (гарчиг) эхэнд, "вэб програмчлал" (тайлбар)
    const typo = await list({ q: 'прогрмчлал' });
    expect(typo.items.map((c: { title: string }) => c.title)).toEqual(['Програмчлалын үндэс', 'React ба Next.js']);
    expect(typo.items[0].title).toBe('Програмчлалын үндэс');

    expect(titles(await list({ q: 'шинжилгэ' }))).toEqual(['Python өгөгдлийн шинжилгээ']);
    expect(titles(await list({ q: 'ПИТОН' }))).toEqual([]); // латин/кирилл хөрвүүлэлт хийхгүй
    expect(titles(await list({ q: 'python' }))).toEqual(['Python өгөгдлийн шинжилгээ']); // том/жижиг үсэг хамаагүй
    // Багшийн нийтийн нэр (зөвшөөрөгдсөн өргөдлийн displayName), алдаатай
    expect(titles(await list({ q: 'Бат-Эрдэнэ Блод' }))).toEqual(['React ба Next.js', 'Програмчлалын үндэс']);
    expect(titles(await list({ q: 'Сараа' }))).toEqual(['Figma анхан шат', 'Python өгөгдлийн шинжилгээ']);
    // Хамааралгүй үг
    expect((await list({ q: 'гитар' })).total).toBe(0);
    // SQL/LIKE тусгай тэмдэгт аюулгүй
    expect((await list({ q: "%' OR 1=1 --" })).total).toBe(0);
  });

  it('хайлт шүүлтүүртэй хослоно', async () => {
    expect(titles(await list({ q: 'програмчлал', level: 'INTERMEDIATE' }))).toEqual(['React ба Next.js']);
    expect(titles(await list({ q: 'програмчлал', category: 'web' }))).toEqual(['React ба Next.js']);
    expect(titles(await list({ q: 'програмчлал', maxPrice: 15 }))).toEqual(['Програмчлалын үндэс']);
    expect((await list({ q: 'програмчлал', sort: 'price_desc' })).items.map((c: { title: string }) => c.title)).toEqual([
      'React ба Next.js',
      'Програмчлалын үндэс',
    ]);
  });
});

describe('Хайлтын denormalized search_text (DB trigger-ээр синк)', () => {
  beforeAll(() => t.reset());

  const hits = async (q: string) =>
    ((await t.http().get('/catalog/courses').query({ q }).expect(200)).body.items as { title: string }[]).map((c) => c.title);
  const searchText = async (id: string) => (await t.prisma.$queryRaw<{ s: string }[]>`SELECT search_text AS s FROM courses WHERE id = ${id}::uuid`)[0]!.s;

  it('курсийн гарчиг, тайлбар өөрчлөгдөхөд хайлтын үр дүн шинэчлэгдэнэ', async () => {
    const teacher = await teacherUser('Зоригтбаатар');
    const c = await courseRow({ teacherId: teacher.id, title: 'Старый заголовок Алгоритм', description: 'Хуучин тайлбар' });
    expect(await searchText(c.id)).toBe('Старый заголовок Алгоритм\nХуучин тайлбар\nЗоригтбаатар');
    expect(await hits('Алгоритм')).toEqual(['Старый заголовок Алгоритм']);

    await t.prisma.course.update({ where: { id: c.id }, data: { title: 'Мэдээллийн сан' } });
    expect(await hits('Алгоритм')).toEqual([]);
    expect(await hits('Мэдээллийн сан')).toEqual(['Мэдээллийн сан']);

    await t.prisma.course.update({ where: { id: c.id }, data: { description: 'Шинэхэн тайлбар Пайплайн' } });
    expect(await hits('Хуучин')).toEqual([]);
    expect(await hits('Пайплайн')).toEqual(['Мэдээллийн сан']);
  });

  it('багшийн нэр (users.name) өөрчлөгдөхөд хайлт шинэчлэгдэнэ', async () => {
    const teacher = await teacherUser('Гантулга');
    await courseRow({ teacherId: teacher.id, title: 'Эдийн засгийн үндэс' });
    expect(await hits('Гантулга')).toEqual(['Эдийн засгийн үндэс']);

    await t.prisma.user.update({ where: { id: teacher.id }, data: { name: 'Отгонбаяр' } });
    expect(await hits('Гантулга')).toEqual([]);
    expect(await hits('Отгонбаяр')).toEqual(['Эдийн засгийн үндэс']);
  });

  it('багшийн нийтийн нэр (зөвшөөрөгдсөн өргөдлийн displayName) болон төлөв өөрчлөгдөхөд шинэчлэгдэнэ', async () => {
    const teacher = await teacherUser('Эрдэнэбат', 'Номинзул');
    await courseRow({ teacherId: teacher.id, title: 'Дүрслэх урлаг' });
    expect(await hits('Номинзул')).toEqual(['Дүрслэх урлаг']);
    expect(await hits('Эрдэнэбат')).toEqual([]); // нийтийн нэр нь displayName

    await t.prisma.teacherApplication.update({ where: { userId: teacher.id }, data: { displayName: 'Цэцэгмаа' } });
    expect(await hits('Номинзул')).toEqual([]);
    expect(await hits('Цэцэгмаа')).toEqual(['Дүрслэх урлаг']);

    // Өргөдөл APPROVED биш болбол users.name руу буцна
    await t.prisma.teacherApplication.update({ where: { userId: teacher.id }, data: { status: 'REJECTED' } });
    expect(await hits('Цэцэгмаа')).toEqual([]);
    expect(await hits('Эрдэнэбат')).toEqual(['Дүрслэх урлаг']);
  });

  it('GIN index ашиглагдана (enable_seqscan=off үед courses_search_text_trgm_idx)', async () => {
    const teacher = await teacherUser('Индекс');
    await courseRow({ teacherId: teacher.id, title: 'Индексийн сорил' });
    const [, , plan] = await t.prisma.$transaction([
      t.prisma.$executeRaw`SET LOCAL enable_seqscan = off`,
      t.prisma.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.45', true)`,
      t.prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`EXPLAIN SELECT c.id FROM courses c WHERE 'Индекс' OPERATOR(extensions.<%) c.search_text OR c.search_text ILIKE '%Индекс%'`,
    ]);
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    expect(text).toContain('courses_search_text_trgm_idx');
  });
});

describe('End-to-end: зохиох → шалгах → каталог', () => {
  beforeAll(() => t.reset());

  it('зөвшөөрөгдсөн курс каталогт гарч, нийтлэгдсэн курсийн шинэ lesson шалгагдах хүртэл нуугдана', async () => {
    const adminS = await loginByEmail(t, 'admin@example.mn');
    await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
    const tch = await loginByEmail(t, 'teacher@example.mn');
    await grantRoleByIdentifier(t.prisma, 'teacher@example.mn', 'TEACHER');
    const cat = (await adminS.agent.post('/admin/categories').send({ name: 'Програмчлал' }).expect(201)).body[0].id;

    const id = (await tch.agent.post('/teacher/courses').send({ title: 'Алгоритм' }).expect(201)).body.id;
    const cover = (await tch.agent.post(`/teacher/courses/${id}/cover-upload`).send({ contentType: 'image/png' }).expect(201)).body;
    t.storage.put('public', cover.key, { size: 1000, contentType: 'image/png' });
    await tch.agent
      .patch(`/teacher/courses/${id}`)
      .send({ description: 'Эрэмбэлэх, хайх', categoryId: cat, priceCredits: 5, coverKey: cover.key })
      .expect(200);
    const sectionId = (await tch.agent.post(`/teacher/courses/${id}/sections`).send({ title: 'Бүлэг' }).expect(201)).body.sections[0].id;
    const d = (await tch.agent.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Эрэмбэ', type: 'TEXT' }).expect(201)).body;
    await tch.agent
      .patch(`/teacher/lessons/${d.sections[0].lessons[0].id}`)
      .send({ priceCredits: 5, content: { markdown: 'Bubble sort' } })
      .expect(200);

    await tch.agent.post(`/teacher/courses/${id}/submit`).expect(200);
    await t.http().get(`/catalog/courses/${id}`).expect(404);
    expect((await t.http().get('/catalog/courses').expect(200)).body.total).toBe(0);

    await adminS.agent.post(`/admin/courses/${id}/approve`).expect(200);
    expect(titles((await t.http().get('/catalog/courses').query({ q: 'алгоритм' }).expect(200)).body)).toEqual(['Алгоритм']);

    // Нийтлэгдсэн курст шинэ lesson → шалгагдах хүртэл каталогт харагдахгүй
    const d2 = (await tch.agent.post(`/teacher/sections/${sectionId}/lessons`).send({ title: 'Хайлт', type: 'TEXT' }).expect(201)).body;
    const newLesson = d2.sections[0].lessons[1];
    await tch.agent
      .patch(`/teacher/lessons/${newLesson.id}`)
      .send({ isFreePreview: true, content: { markdown: 'Binary search' } })
      .expect(200);
    await tch.agent.post(`/teacher/courses/${id}/submit`).expect(200);
    let pub = (await t.http().get(`/catalog/courses/${id}`).expect(200)).body;
    expect(pub.sections[0].lessons.map((l: { title: string }) => l.title)).toEqual(['Эрэмбэ']);
    await t.http().get(`/catalog/lessons/${newLesson.id}`).expect(404);

    await adminS.agent.post(`/admin/courses/${id}/approve`).expect(200);
    pub = (await t.http().get(`/catalog/courses/${id}`).expect(200)).body;
    expect(pub.sections[0].lessons.map((l: { title: string }) => l.title)).toEqual(['Эрэмбэ', 'Хайлт']);
    expect((await t.http().get(`/catalog/lessons/${newLesson.id}`).expect(200)).body.content).toEqual({ type: 'TEXT', markdown: 'Binary search' });
  });
});
