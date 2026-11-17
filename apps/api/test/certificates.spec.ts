import { inflateSync } from 'node:zlib';
import type { LessonType, Prisma } from '@lms/db';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

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
// Fixture-ууд (learning.spec.ts-тэй ижил): курс DB-д шууд, эрх HTTP худалдан авалтаар, явц HTTP-ээр.
// ---------------------------------------------------------------------------

// Quiz: 3 асуулт (нэг сонголттой), тэнцэх оноо 60% → 2/3 зөв = 66%, 3/3 = 100%.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q1 = id(1), Q1A = id(11), Q1B = id(12);
const Q2 = id(2), Q2A = id(21), Q2B = id(22);
const Q3 = id(3), Q3A = id(31), Q3B = id(32);
const QUIZ = {
  passPercent: 60,
  questions: [
    { id: Q1, text: '2 + 2 = ?', multiple: false, options: [{ id: Q1A, text: '4' }, { id: Q1B, text: '5' }], correctOptionIds: [Q1A] },
    { id: Q2, text: '3 + 3 = ?', multiple: false, options: [{ id: Q2A, text: '6' }, { id: Q2B, text: '7' }], correctOptionIds: [Q2A] },
    { id: Q3, text: 'Нийслэл', multiple: false, options: [{ id: Q3A, text: 'Улаанбаатар' }, { id: Q3B, text: 'Дархан' }], correctOptionIds: [Q3A] },
  ],
};
const ALL_CORRECT = [
  { questionId: Q1, optionIds: [Q1A] },
  { questionId: Q2, optionIds: [Q2A] },
  { questionId: Q3, optionIds: [Q3A] },
];
const TWO_CORRECT = [
  { questionId: Q1, optionIds: [Q1A] },
  { questionId: Q2, optionIds: [Q2A] },
  { questionId: Q3, optionIds: [Q3B] },
];

const CODE_RE = /^[A-HJ-NP-Z2-9]{16}$/;

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  await s.agent.patch('/me').send({ name: 'Батболд Багш' }).expect(200);
  return s;
}

async function learner(email = 'learner@example.mn', name: string | null = 'Өлзийбаяр Үүрцайх') {
  const s = await loginByEmail(t, email);
  await t.prisma.$transaction(
    (tx) => credits.grant(tx, { userId: s.user.id, credits: 100, source: 'ADMIN_ADJUST' }),
    CREDIT_TX_OPTIONS,
  );
  if (name) await s.agent.patch('/me').send({ name }).expect(200);
  return s;
}

interface LessonSpec {
  type?: LessonType;
  archived?: boolean;
  reviewStatus?: 'APPROVED' | 'IN_REVIEW';
}

let seq = 0;

/** Анхдагч: TEXT, PDF, QUIZ, VIDEO. Курсийн үнэ 10, lesson бүр 5 кредит. */
async function course(teacherId: string, lessons: LessonSpec[] = [{ type: 'TEXT' }, { type: 'PDF' }, { type: 'QUIZ' }, { type: 'VIDEO' }]) {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Монгол хэлний курс ${++seq}`,
      priceCredits: 10,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const lessonsOut: { id: string; type: LessonType }[] = [];
  for (const [i, l] of lessons.entries()) {
    const type = l.type ?? 'TEXT';
    const content: Prisma.InputJsonValue =
      type === 'QUIZ'
        ? QUIZ
        : type === 'PDF'
          ? { fileKey: null, fileName: null, size: null }
          : type === 'TEXT'
            ? { markdown: 'агуулга' }
            : type === 'LIVE'
              ? { startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 60, meetingUrl: 'https://meet.example/x' }
              : {};
    const lesson = await t.prisma.lesson.create({
      data: {
        courseId: row.id,
        sectionId: row.sections[0]!.id,
        title: `Хичээл ${i + 1}`,
        type,
        position: i,
        priceCredits: 5,
        reviewStatus: l.reviewStatus ?? 'APPROVED',
        archivedAt: l.archived ? new Date() : null,
        content,
      },
    });
    lessonsOut.push({ id: lesson.id, type });
  }
  return { id: row.id, title: row.title, lessons: lessonsOut };
}

const buyLesson = (a: Agent, lessonId: string) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);
const buyCourse = (a: Agent, courseId: string, expected: number) =>
  a.post(`/purchases/courses/${courseId}`).send({ confirmNoRefund: true, expectedCredits: expected }).expect(201);

/**
 * Lesson-ыг төрлөөр нь дуусгана (quiz — өгсөн хариултаар). Quiz-ийн хурдны хязгаар (30 сек / 24 цагт 10)
 * дахин оролдлогод саад болохгүйн тулд өмнөх оролдлогуудыг 25 цагаар хуучруулна (`learning.spec.ts`-тэй адил).
 */
async function finish(a: Agent, lesson: { id: string; type: LessonType }, answers = ALL_CORRECT) {
  if (lesson.type === 'VIDEO') await a.post(`/learning/lessons/${lesson.id}/progress`).send({ watchedPercent: 100 }).expect(200);
  else if (lesson.type === 'QUIZ') {
    await t.prisma.$executeRaw`UPDATE quiz_attempts SET created_at = created_at - interval '25 hours'`;
    await a.post(`/learning/lessons/${lesson.id}/quiz-attempts`).send({ answers }).expect(201);
  }
  else await a.post(`/learning/lessons/${lesson.id}/complete`).expect(200);
}

const status = async (a: Agent, courseId: string) => (await a.get(`/learning/courses/${courseId}/certificate`).expect(200)).body;
const certNotifications = (userId: string) => t.prisma.notification.findMany({ where: { userId, type: 'CERTIFICATE_ISSUED' } });

// ---------------------------------------------------------------------------

describe('Сертификат — нөхцөл хангаагүй үед олгогдохгүй', () => {
  it('бүх lesson-ыг ширхэгээр авч дуусгасан ч (бүтэн эзэмшилгүй) олгохгүй; дараа нь курсийг бүтнээр авахад хүсэлтээр олгоно', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const u = await learner();
    for (const l of c.lessons) await buyLesson(u.agent, l.id);
    for (const l of c.lessons) await finish(u.agent, l);

    expect(await t.prisma.certificate.count()).toBe(0);
    const s = await status(u.agent, c.id);
    expect(s.certificate).toBeNull();
    expect(s.eligibility).toMatchObject({
      ownsCourse: false,
      lessonCount: 4,
      completedLessonCount: 4,
      quizCount: 1,
      quizAveragePercent: 100,
      eligible: false,
    });
    const denied = await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(409);
    expect(denied.body.code).toBe('CERTIFICATE_NOT_ELIGIBLE');
    expect(await t.prisma.certificate.count()).toBe(0);

    // Ширхэгээр 20 кредит зарцуулсан тул курс (10) 0 кредитээр бүтэн болно → явцын үйлдэлгүй тул хүсэлтээр
    await buyCourse(u.agent, c.id, 0);
    expect((await status(u.agent, c.id)).eligibility.eligible).toBe(true);
    const issued = await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(201);
    expect(issued.body.code).toMatch(CODE_RE);
    expect(await certNotifications(u.user.id)).toHaveLength(1);
  });

  it('нэг lesson дуусаагүй бол олгохгүй; сүүлийн lesson дуусахад автоматаар олгож, мэдэгдэл (in-app + имэйл) нэг удаа илгээнэ', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    for (const l of c.lessons.slice(0, 3)) await finish(u.agent, l);

    // Видеог 89% үзсэн нь дуусаагүй
    const video = c.lessons[3]!;
    await u.agent.post(`/learning/lessons/${video.id}/progress`).send({ watchedPercent: 89 }).expect(200);
    expect(await t.prisma.certificate.count()).toBe(0);
    const s = await status(u.agent, c.id);
    expect(s.eligibility).toMatchObject({ ownsCourse: true, lessonCount: 4, completedLessonCount: 3, eligible: false });
    expect((await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(409)).body.code).toBe('CERTIFICATE_NOT_ELIGIBLE');

    await finish(u.agent, video);
    const after = await status(u.agent, c.id);
    expect(after.eligibility.eligible).toBe(true);
    expect(after.certificate).toMatchObject({
      courseId: c.id,
      recipientName: 'Өлзийбаяр Үүрцайх',
      courseTitle: c.title,
      teacherName: 'Батболд Багш',
      quizAveragePercent: 100,
    });
    expect(after.certificate.code).toMatch(CODE_RE);

    // Дахин дуусгах / хүсэлт → шинэ сертификат, мэдэгдэл үүсэхгүй
    await finish(u.agent, video);
    const again = await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(200);
    expect(again.body.code).toBe(after.certificate.code);
    expect(await t.prisma.certificate.count()).toBe(1);

    const notes = await certNotifications(u.user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.link).toBe(`/learning/${c.id}`);
    expect(notes[0]!.emailStatus).toBe('QUEUED');
    await t.queue.drain();
    expect(t.email.last('learner@example.mn')?.subject).toContain(c.title);
  });

  it('quiz-ийн хамгийн өндөр онооны дундаж < 70% бол олгохгүй (бүх quiz тэнцсэн ч); дахин оролдож дундаж өсөхөд олгоно', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }, { type: 'QUIZ' }, { type: 'QUIZ' }]);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    await finish(u.agent, c.lessons[0]!);
    await finish(u.agent, c.lessons[1]!, TWO_CORRECT); // 66% — тэнцсэн
    await finish(u.agent, c.lessons[2]!, TWO_CORRECT); // 66%

    expect(await t.prisma.certificate.count()).toBe(0);
    const s = await status(u.agent, c.id);
    expect(s.eligibility).toMatchObject({
      completedLessonCount: 3,
      lessonCount: 3,
      quizCount: 2,
      quizAveragePercent: 66,
      minQuizAveragePercent: 70,
      eligible: false,
    });
    expect((await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(409)).body.code).toBe('CERTIFICATE_NOT_ELIGIBLE');

    // 100 + 66 → 83% (floor) ≥ 70
    await finish(u.agent, c.lessons[2]!, ALL_CORRECT);
    const after = await status(u.agent, c.id);
    expect(after.certificate).toMatchObject({ quizAveragePercent: 83 });
  });

  it('тэнцээгүй quiz (дуусаагүй) байвал олгохгүй', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }, { type: 'QUIZ' }]);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    await finish(u.agent, c.lessons[0]!);
    await u.agent
      .post(`/learning/lessons/${c.lessons[1]!.id}/quiz-attempts`)
      .send({ answers: [{ questionId: Q1, optionIds: [Q1A] }] }) // 33% — тэнцээгүй
      .expect(201);
    expect(await t.prisma.certificate.count()).toBe(0);
    expect((await status(u.agent, c.id)).eligibility).toMatchObject({ completedLessonCount: 1, quizAveragePercent: 33, eligible: false });
  });

  it('profile-д нэргүй бол автоматаар олгохгүй, хүсэлтэд 409 NAME_REQUIRED; нэрээ оруулсны дараа олгоно', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }]);
    const u = await learner('noname@example.mn', null);
    await buyCourse(u.agent, c.id, 10);
    await finish(u.agent, c.lessons[0]!);

    expect(await t.prisma.certificate.count()).toBe(0);
    expect((await status(u.agent, c.id)).eligibility).toMatchObject({ nameMissing: true, eligible: false });
    expect((await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(409)).body.code).toBe('NAME_REQUIRED');

    await u.agent.patch('/me').send({ name: 'Сараа' }).expect(200);
    const issued = await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(201);
    expect(issued.body.recipientName).toBe('Сараа');
  });

  it('эрхгүй / зочин: зочин 401, нийтлэгдээгүй курс 404', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }]);
    await t.http().get(`/learning/courses/${c.id}/certificate`).expect(401);
    await t.http().post(`/learning/courses/${c.id}/certificate`).expect(401);
    const u = await learner();
    await t.prisma.course.update({ where: { id: c.id }, data: { status: 'DRAFT' } });
    await u.agent.get(`/learning/courses/${c.id}/certificate`).expect(404);
    await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(404);
  });
});

describe('Сертификат — тооцох lesson-ууд', () => {
  it('архивласан, шалгагдаагүй, ASSIGNMENT, LIVE lesson нөхцөлд тооцогдохгүй', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [
      { type: 'TEXT' },
      { type: 'QUIZ', archived: true },
      { type: 'TEXT', reviewStatus: 'IN_REVIEW' },
      { type: 'ASSIGNMENT' },
      { type: 'LIVE' },
    ]);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    await finish(u.agent, c.lessons[0]!);

    const s = await status(u.agent, c.id);
    expect(s.eligibility).toMatchObject({ lessonCount: 1, completedLessonCount: 1, quizCount: 0, quizAveragePercent: null });
    expect(s.certificate).toMatchObject({ quizAveragePercent: null });
    expect((await t.prisma.certificate.findFirstOrThrow()).lessonCount).toBe(1);
  });

  it('тооцох lesson-гүй курст олгохгүй', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'ASSIGNMENT' }]);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    expect((await status(u.agent, c.id)).eligibility).toMatchObject({ lessonCount: 0, eligible: false });
    await u.agent.post(`/learning/courses/${c.id}/certificate`).expect(409);
  });
});

describe('Сертификат — verify, PDF, өөрчлөгдөхгүй', () => {
  async function issued() {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }]);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    await finish(u.agent, c.lessons[0]!);
    const s = await status(u.agent, c.id);
    return { c, u, cert: s.certificate as { code: string; issuedAt: string } };
  }

  it('нийтийн verify: нэвтрэлтгүй, код жижиг үсэг/зураастай ч таарна; байхгүй/буруу код 404', async () => {
    const { c, cert } = await issued();
    const res = await t.http().get(`/certificates/verify/${cert.code}`).expect(200);
    expect(res.body).toEqual({
      code: cert.code,
      recipientName: 'Өлзийбаяр Үүрцайх',
      courseTitle: c.title,
      teacherName: 'Батболд Багш',
      issuedAt: cert.issuedAt,
    });
    // Хувийн мэдээлэл (user id, имэйл) гарахгүй
    expect(JSON.stringify(res.body)).not.toContain('learner@example.mn');

    const pretty = cert.code.toLowerCase().match(/.{4}/g)!.join('-');
    expect((await t.http().get(`/certificates/verify/${pretty}`).expect(200)).body.code).toBe(cert.code);

    const missing = await t.http().get('/certificates/verify/AAAAAAAAAAAAAAAA').expect(404);
    expect(missing.body.code).toBe('CERTIFICATE_NOT_FOUND');
    await t.http().get('/certificates/verify/not-a-code').expect(404);
  });

  it('PDF зөвхөн эзэмшигчид: монгол фонт шигтгэсэн, QR (verify URL); бусад 404, зочин 401', async () => {
    const { u, cert } = await issued();
    const res = await u.agent
      .get(`/learning/certificates/${cert.code}/pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`certificate-${cert.code}.pdf`);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const raw = pdf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Bold/);
    expect(raw).toMatch(/\/Subtype \/Image/); // QR
    // ToUnicode cmap-д монгол үсэг (Ө U+04E8, Ү U+04AE) байгаа — нэр зөв glyph-ээр бичигдсэн
    const streams = inflateStreams(pdf).join('\n');
    expect(streams).toMatch(/<04e8>/i);
    expect(streams).toMatch(/<04ae>/i);

    const other = await learner('other@example.mn');
    await other.agent.get(`/learning/certificates/${cert.code}/pdf`).expect(404);
    await t.http().get(`/learning/certificates/${cert.code}/pdf`).expect(401);
  });

  it('олгогдсон сертификат өөрчлөгдөхгүй: нэр/курс солигдсон ч verify хэвээр; DB update хориотой; "миний сертификатууд"', async () => {
    const { c, u, cert } = await issued();
    await u.agent.patch('/me').send({ name: 'Өөр нэр' }).expect(200);
    await t.prisma.course.update({ where: { id: c.id }, data: { title: 'Шинэ нэр' } });
    const res = await t.http().get(`/certificates/verify/${cert.code}`).expect(200);
    expect(res.body).toMatchObject({ recipientName: 'Өлзийбаяр Үүрцайх', courseTitle: c.title });

    await expect(
      t.prisma.certificate.update({ where: { code: cert.code }, data: { recipientName: 'Хуурамч' } }),
    ).rejects.toThrow(/immutable/);

    const mine = await u.agent.get('/learning/certificates').expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].code).toBe(cert.code);
  });

  it('код хэрэглэгч бүрт өөр, таамаглах боломжгүй формат', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }]);
    const codes: string[] = [];
    for (const email of ['a@example.mn', 'b@example.mn', 'c@example.mn']) {
      const u = await learner(email);
      await buyCourse(u.agent, c.id, 10);
      await finish(u.agent, c.lessons[0]!);
      codes.push((await status(u.agent, c.id)).certificate.code);
    }
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) expect(code).toMatch(CODE_RE);
  });
});

/** PDF дахь FlateDecode stream-үүдийг задална (ToUnicode cmap шалгахад). */
function inflateStreams(pdf: Buffer): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const start = pdf.indexOf('stream\n', i);
    if (start < 0) break;
    const end = pdf.indexOf('\nendstream', start);
    if (end < 0) break;
    try {
      out.push(inflateSync(pdf.subarray(start + 7, end)).toString('latin1'));
    } catch {
      // шахаагүй / зураг
    }
    i = end + 10;
  }
  return out;
}
