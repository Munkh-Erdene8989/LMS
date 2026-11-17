import type { LessonType, Prisma } from '@lms/db';
import { ASSIGNMENT_FILE_MAX_BYTES } from '@lms/shared';
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
// Fixture-ууд: курс DB-д шууд (даалгавар зохиох урсгалыг тусад нь HTTP-ээр шалгана), эрх HTTP худалдан авалтаар.
// ---------------------------------------------------------------------------

const ASSIGNMENT = { instructions: 'Эссэ бичнэ үү', maxScore: 20 };

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

async function admin(email = 'admin@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'ADMIN');
  return s;
}

async function learner(email = 'learner@example.mn', balance = 100) {
  const s = await loginByEmail(t, email);
  if (balance > 0) {
    await t.prisma.$transaction(
      (tx) => credits.grant(tx, { userId: s.user.id, credits: balance, source: 'ADMIN_ADJUST' }),
      CREDIT_TX_OPTIONS,
    );
  }
  return s;
}

interface LessonSpec {
  type?: LessonType;
  content?: Prisma.InputJsonValue;
  preview?: boolean;
}

let seq = 0;

/** Анхдагч: ASSIGNMENT, TEXT, QUIZ (нэг асуулттай). */
async function course(teacherId: string, lessons: LessonSpec[] = [{ type: 'ASSIGNMENT' }, { type: 'TEXT' }, { type: 'QUIZ' }]) {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Курс ${++seq}`,
      priceCredits: 10,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const ids: string[] = [];
  for (const [i, l] of lessons.entries()) {
    const type = l.type ?? 'ASSIGNMENT';
    const lesson = await t.prisma.lesson.create({
      data: {
        courseId: row.id,
        sectionId: row.sections[0]!.id,
        title: `Хичээл ${i + 1}`,
        type,
        position: i,
        priceCredits: 5,
        isFreePreview: l.preview ?? false,
        reviewStatus: 'APPROVED',
        content:
          l.content ??
          (type === 'ASSIGNMENT'
            ? ASSIGNMENT
            : type === 'QUIZ'
              ? {
                  passPercent: 50,
                  questions: [
                    {
                      id: '00000000-0000-4000-8000-000000000001',
                      text: '?',
                      multiple: false,
                      options: [
                        { id: '00000000-0000-4000-8000-000000000011', text: 'a' },
                        { id: '00000000-0000-4000-8000-000000000012', text: 'b' },
                      ],
                      correctOptionIds: ['00000000-0000-4000-8000-000000000011'],
                    },
                  ],
                }
              : { markdown: 'агуулга' }),
      },
    });
    ids.push(lesson.id);
  }
  return { id: row.id, lessonIds: ids };
}

const buyLesson = (a: Agent, lessonId: string) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);
const buyCourse = (a: Agent, courseId: string, expected: number) =>
  a.post(`/purchases/courses/${courseId}`).send({ confirmNoRefund: true, expectedCredits: expected }).expect(201);
const submit = (a: Agent, lessonId: string, body: object) => a.post(`/learning/lessons/${lessonId}/assignment/submissions`).send(body);
const ticket = (a: Agent, lessonId: string, size = 1000, fileName = 'essay.docx') =>
  a.post(`/learning/lessons/${lessonId}/assignment/upload`).send({ fileName, size });

/** Browser upload хийсэн мэт: ticket авч, fake storage-д объект үүсгэнэ. */
async function uploaded(a: Agent, lessonId: string, size: number, contentType = 'application/pdf') {
  const tk = (await ticket(a, lessonId, Math.min(size, ASSIGNMENT_FILE_MAX_BYTES)).expect(201)).body;
  t.storage.put('private', tk.key, { size, contentType });
  return tk.key as string;
}

async function ownerSetup() {
  const tch = await teacher();
  const c = await course(tch.user.id);
  const u = await learner();
  await buyLesson(u.agent, c.lessonIds[0]!);
  return { tch, c, u, lessonId: c.lessonIds[0]! };
}

// ---------------------------------------------------------------------------

describe('Даалгавар — зохиох', () => {
  it('багш ASSIGNMENT lesson үүсгэж, тайлбар + хамгийн их оноо тохируулна; буруу оноо 400', async () => {
    const tch = await teacher();
    const created = (await tch.agent.post('/teacher/courses').send({ title: 'Курс' }).expect(201)).body;
    const withSection = (await tch.agent.post(`/teacher/courses/${created.id}/sections`).send({ title: 'Бүлэг' }).expect(201)).body;
    const d = (
      await tch.agent.post(`/teacher/sections/${withSection.sections[0].id}/lessons`).send({ title: 'Эссэ', type: 'ASSIGNMENT' }).expect(201)
    ).body;
    const lesson = d.sections[0].lessons[0];
    expect(lesson.content).toEqual({ type: 'ASSIGNMENT', instructions: '', maxScore: null });
    expect(lesson.problems).toEqual(['Даалгаврын тайлбар хоосон', 'Хамгийн их оноо тогтоогоогүй']);

    for (const bad of [{ instructions: 'x', maxScore: 0 }, { instructions: 'x', maxScore: 1001 }, { instructions: 'x', maxScore: 1.5 }, { instructions: 'x' }]) {
      const res = await tch.agent.patch(`/teacher/lessons/${lesson.id}`).send({ content: bad }).expect(400);
      expect(res.body.code).toBe('INVALID_ASSIGNMENT');
    }
    const ok = (await tch.agent.patch(`/teacher/lessons/${lesson.id}`).send({ content: ASSIGNMENT }).expect(200)).body;
    expect(ok.sections[0].lessons[0].content).toEqual({ type: 'ASSIGNMENT', ...ASSIGNMENT });
    expect(ok.sections[0].lessons[0].problems).toEqual([]);
  });
});

describe('Даалгавар — илгээх эрх', () => {
  it('зочин 401, эрхгүй 403 LESSON_LOCKED, preview/багш/админ үзэх ч илгээхгүй (ASSIGNMENT_OWNERS_ONLY); юу ч бичигдэхгүй', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'ASSIGNMENT' }, { type: 'ASSIGNMENT', preview: true }, { type: 'TEXT' }]);
    const [locked, preview, text] = c.lessonIds as [string, string, string];
    const u = await learner();
    const adm = await admin();

    await t.http().post(`/learning/lessons/${locked}/assignment/submissions`).send({ text: 'x' }).expect(401);
    expect((await submit(u.agent, locked, { text: 'x' }).expect(403)).body.code).toBe('LESSON_LOCKED');
    expect((await ticket(u.agent, locked).expect(403)).body.code).toBe('LESSON_LOCKED');
    // Өөр lesson эзэмших хангалтгүй
    await buyLesson(u.agent, text);
    await submit(u.agent, locked, { text: 'x' }).expect(403);

    // Free preview: тайлбар харагдана, илгээх эрхгүй
    const content = (await u.agent.get(`/catalog/lessons/${preview}`).expect(200)).body;
    expect(content.content).toEqual({ type: 'ASSIGNMENT', ...ASSIGNMENT });
    const state = (await u.agent.get(`/learning/lessons/${preview}`).expect(200)).body;
    expect(state.assignment).toEqual({ maxScore: 20, canSubmit: false, submissions: [] });
    expect((await submit(u.agent, preview, { text: 'x' }).expect(403)).body.code).toBe('ASSIGNMENT_OWNERS_ONLY');
    expect((await ticket(u.agent, preview).expect(403)).body.code).toBe('ASSIGNMENT_OWNERS_ONLY');

    for (const who of [tch, adm]) {
      expect((await who.agent.get(`/learning/lessons/${locked}`).expect(200)).body.assignment.canSubmit).toBe(false);
      expect((await submit(who.agent, locked, { text: 'x' }).expect(403)).body.code).toBe('ASSIGNMENT_OWNERS_ONLY');
    }

    // Даалгавар биш lesson
    expect((await submit(u.agent, text, { text: 'x' }).expect(400)).body.code).toBe('NOT_AN_ASSIGNMENT');
    expect(await t.prisma.assignmentSubmission.count()).toBe(0);
  });

  it('эзэмшигч (lesson эсвэл бүтэн курс) текстээр илгээнэ; хоосон илгээлт 400', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    const lessonId = c.lessonIds[0]!;

    expect((await submit(u.agent, lessonId, {}).expect(400)).body.code).toBe('EMPTY_SUBMISSION');
    expect((await submit(u.agent, lessonId, { text: '   ' }).expect(400)).body.code).toBe('EMPTY_SUBMISSION');
    const state = (await submit(u.agent, lessonId, { text: '  Миний эссэ  ' }).expect(201)).body;
    expect(state.canSubmit).toBe(true);
    expect(state.submissions).toHaveLength(1);
    expect(state.submissions[0]).toMatchObject({ text: 'Миний эссэ', file: null, review: null });
  });
});

describe('Даалгавар — файл', () => {
  it('50MB хүртэлх файл хүлээн авна; 50MB-аас их бол ticket ч, илгээлт ч 400 FILE_TOO_LARGE (объект устгагдана)', async () => {
    const { u, lessonId } = await ownerSetup();

    expect((await ticket(u.agent, lessonId, ASSIGNMENT_FILE_MAX_BYTES + 1).expect(400)).body.code).toBe('FILE_TOO_LARGE');

    // Мэдэгдсэн хэмжээгээ худал хэлж том файл upload хийсэн — storage-ийн бодит хэмжээгээр шалгана
    const bigKey = await uploaded(u.agent, lessonId, ASSIGNMENT_FILE_MAX_BYTES + 1);
    const big = await submit(u.agent, lessonId, { file: { key: bigKey, name: 'big.pdf' } }).expect(400);
    expect(big.body.code).toBe('FILE_TOO_LARGE');
    expect(await t.storage.info('private', bigKey)).toBeNull();
    expect(await t.prisma.assignmentSubmission.count()).toBe(0);
    expect(await t.prisma.lessonProgress.count({ where: { completedAt: { not: null } } })).toBe(0);

    const key = await uploaded(u.agent, lessonId, ASSIGNMENT_FILE_MAX_BYTES);
    expect(key).toMatch(new RegExp(`^submissions/${lessonId}/${u.user.id}/[0-9a-f-]+\\.docx$`));
    const state = (await submit(u.agent, lessonId, { text: 'тайлбар', file: { key, name: 'essay.pdf' } }).expect(201)).body;
    expect(state.submissions[0]).toMatchObject({
      text: 'тайлбар',
      file: { name: 'essay.pdf', size: ASSIGNMENT_FILE_MAX_BYTES, contentType: 'application/pdf' },
    });
    // Хариунд storage-ийн зам, URL байхгүй — татах URL тусдаа endpoint-оор
    expect(JSON.stringify(state)).not.toContain('submissions/');
  });

  it('upload хийгээгүй эсвэл бусдын замтай файл 400 INVALID_UPLOAD', async () => {
    const { c, u, lessonId } = await ownerSetup();
    const other = await learner('other@example.mn');
    await buyLesson(other.agent, lessonId);
    const othersKey = await uploaded(other.agent, lessonId, 100);

    expect((await submit(u.agent, lessonId, { file: { key: othersKey, name: 'x.pdf' } }).expect(400)).body.code).toBe('INVALID_UPLOAD');
    const missing = `submissions/${lessonId}/${u.user.id}/nope.pdf`;
    expect((await submit(u.agent, lessonId, { file: { key: missing, name: 'x.pdf' } }).expect(400)).body.code).toBe('INVALID_UPLOAD');
    // Өөр lesson-ы замаар upload хийсэн файл
    await buyLesson(u.agent, c.lessonIds[1]!);
    const wrongLesson = `submissions/${c.lessonIds[1]}/${u.user.id}/x.pdf`;
    t.storage.put('private', wrongLesson, { size: 100, contentType: 'application/pdf' });
    expect((await submit(u.agent, lessonId, { file: { key: wrongLesson, name: 'x.pdf' } }).expect(400)).body.code).toBe('INVALID_UPLOAD');
    expect(await t.prisma.assignmentSubmission.count()).toBe(0);

    const key = await uploaded(u.agent, lessonId, 100);
    expect((await submit(u.agent, lessonId, { file: { key, name: 'x.pdf' } }).expect(201)).body.submissions).toHaveLength(1);
  });

  it('файлын signed URL зөвхөн илгээгч, курсийн багш, админд; бусдад (lesson эзэмшигч, өөр багш) 404, зочин 401', async () => {
    const { tch, u, lessonId } = await ownerSetup();
    const key = await uploaded(u.agent, lessonId, 1234);
    const sub = (await submit(u.agent, lessonId, { file: { key, name: 'essay.pdf' } }).expect(201)).body.submissions[0];
    const path = `/learning/assignment-submissions/${sub.id}/file`;

    for (const who of [u, tch, await admin()]) {
      const r = (await who.agent.get(path).expect(200)).body;
      expect(r).toEqual({ url: `https://fake-storage.test/signed/private/${key}?expiresIn=600`, expiresInSeconds: 600 });
    }

    const classmate = await learner('classmate@example.mn');
    await buyLesson(classmate.agent, lessonId);
    const otherTeacher = await teacher('other-teacher@example.mn');
    for (const who of [classmate, otherTeacher]) {
      expect((await who.agent.get(path).expect(404)).body.code).toBe('NOT_FOUND');
    }
    await t.http().get(path).expect(401);

    // Текст илгээлтэд файл байхгүй
    const textOnly = (await submit(u.agent, lessonId, { text: 'x' }).expect(201)).body.submissions[0];
    await u.agent.get(`/learning/assignment-submissions/${textOnly.id}/file`).expect(404);
  });
});

describe('Даалгавар — шалгах, мэдэгдэл', () => {
  it('багшийн inbox (шалгаагүй/шалгасан), оноо + сэтгэгдэл, суралцагчид мэдэгдэл; дахин илгээхэд дахин шалгаагүйд орно', async () => {
    const { tch, c, u, lessonId } = await ownerSetup();
    const u2 = await learner('second@example.mn');
    await buyLesson(u2.agent, lessonId);
    const otherTeacher = await teacher('other-teacher@example.mn');

    const first = (await submit(u.agent, lessonId, { text: 'эхний хувилбар' }).expect(201)).body.submissions[0];
    await submit(u2.agent, lessonId, { text: 'хоёр дахь суралцагч' }).expect(201);

    // Learner-үүд inbox-д хандахгүй, өөр багшид харагдахгүй
    await u.agent.get('/teacher/assignments').expect(403);
    const foreign = (await otherTeacher.agent.get('/teacher/assignments').expect(200)).body;
    expect(foreign).toEqual({ items: [], nextCursor: null, unreviewedCount: 0 });

    let inbox = (await tch.agent.get('/teacher/assignments?status=UNREVIEWED').expect(200)).body;
    expect(inbox.unreviewedCount).toBe(2);
    expect(inbox.items.map((i: { text: string }) => i.text)).toEqual(['эхний хувилбар', 'хоёр дахь суралцагч']); // хуучин нь эхэндээ
    expect(inbox.items[0]).toMatchObject({
      id: first.id,
      learner: { id: u.user.id },
      lesson: { id: lessonId, title: 'Хичээл 1', maxScore: 20 },
      course: { id: c.id },
      attempt: 1,
      review: null,
      previousReview: null,
    });
    expect((await tch.agent.get(`/teacher/assignments?status=UNREVIEWED&limit=1`).expect(200)).body.nextCursor).toBe(first.id);
    expect((await tch.agent.get(`/teacher/assignments?courseId=${c.id}`).expect(200)).body.items).toHaveLength(2);

    // Буруу оноо, өөр багш
    const review = (who: Agent, body: object) => who.post(`/teacher/assignments/${first.id}/review`).send(body);
    expect((await review(tch.agent, { score: 21 }).expect(400)).body.code).toBe('INVALID_SCORE');
    await review(tch.agent, { score: -1 }).expect(400);
    await review(otherTeacher.agent, { score: 10 }).expect(404);
    expect(await t.prisma.notification.count({ where: { type: 'ASSIGNMENT_REVIEWED' } })).toBe(0);

    const reviewed = (await review(tch.agent, { score: 15, comment: '  Сайн, гэхдээ дүгнэлт дутуу  ' }).expect(200)).body;
    expect(reviewed.review).toMatchObject({ score: 15, maxScore: 20, comment: 'Сайн, гэхдээ дүгнэлт дутуу' });

    // Мэдэгдэл: in-app + имэйл, хичээлийн хуудас руу
    const notes = await t.prisma.notification.findMany({ where: { type: 'ASSIGNMENT_REVIEWED' } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      userId: u.user.id,
      link: `/courses/${c.id}/lessons/${lessonId}`,
      params: { title: 'Хичээл 1', score: 15, maxScore: 20 },
    });
    await t.queue.drain();
    expect(t.email.last('learner@example.mn')?.subject).toContain('15/20');
    const list = (await u.agent.get('/notifications').expect(200)).body;
    expect(list.items[0].title).toBe('"Хичээл 1" даалгавар шалгагдлаа: 15/20');

    inbox = (await tch.agent.get('/teacher/assignments').expect(200)).body;
    expect(inbox.unreviewedCount).toBe(1);
    expect(inbox.items.map((i: { learner: { id: string } }) => i.learner.id)).toEqual([u2.user.id]);
    const done = (await tch.agent.get('/teacher/assignments?status=REVIEWED').expect(200)).body;
    expect(done.items).toHaveLength(1);
    expect(done.items[0].review.score).toBe(15);

    // Суралцагч үнэлгээгээ харна
    const state = (await u.agent.get(`/learning/lessons/${lessonId}`).expect(200)).body.assignment;
    expect(state.submissions[0].review).toMatchObject({ score: 15, maxScore: 20, comment: 'Сайн, гэхдээ дүгнэлт дутуу' });

    // Дахин илгээх → шинэ илгээлт шалгаагүйд, өмнөх үнэлгээ хавсарна; түүх хадгалагдана
    const again = (await submit(u.agent, lessonId, { text: 'засварласан' }).expect(201)).body;
    expect(again.submissions.map((s: { text: string }) => s.text)).toEqual(['засварласан', 'эхний хувилбар']);
    expect(again.submissions[0].review).toBeNull();
    expect(again.submissions[1].review.score).toBe(15);
    inbox = (await tch.agent.get('/teacher/assignments').expect(200)).body;
    expect(inbox.unreviewedCount).toBe(2);
    const resubmitted = inbox.items.find((i: { learner: { id: string } }) => i.learner.id === u.user.id);
    expect(resubmitted).toMatchObject({ text: 'засварласан', attempt: 2, review: null, previousReview: { score: 15, maxScore: 20 } });
    expect((await tch.agent.get('/teacher/assignments?status=REVIEWED').expect(200)).body.items).toHaveLength(0);

    // Дахин үнэлэх (засвар) — мэдэгдэл дахин
    await tch.agent.post(`/teacher/assignments/${resubmitted.id}/review`).send({ score: 20 }).expect(200);
    await tch.agent.post(`/teacher/assignments/${resubmitted.id}/review`).send({ score: 19, comment: 'засвар' }).expect(200);
    expect(await t.prisma.notification.count({ where: { type: 'ASSIGNMENT_REVIEWED', userId: u.user.id } })).toBe(3);
    const latest = (await u.agent.get(`/learning/lessons/${lessonId}`).expect(200)).body.assignment.submissions[0];
    expect(latest.review).toMatchObject({ score: 19, comment: 'засвар' });
  });
});

describe('Даалгавар — явц ба сертификатаас тусдаа', () => {
  it('анхны илгээлтээр lesson дууссан (курсийн явцад тооцогдоно), оноо quiz-ийн best_score-д орохгүй; гараар дуусгах 409', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const u = await learner();
    await buyCourse(u.agent, c.id, 10);
    const lessonId = c.lessonIds[0]!;

    expect((await u.agent.post(`/learning/lessons/${lessonId}/complete`).expect(409)).body.code).toBe('COMPLETION_NOT_MANUAL');

    const sub = (await submit(u.agent, lessonId, { text: 'x' }).expect(201)).body.submissions[0];
    await tch.agent.post(`/teacher/assignments/${sub.id}/review`).send({ score: 4 }).expect(200);

    const state = (await u.agent.get(`/learning/lessons/${lessonId}`).expect(200)).body;
    expect(state.progress).toMatchObject({ completed: true, bestScorePercent: null });
    expect(state.quiz).toBeNull();
    const detail = (await u.agent.get(`/learning/courses/${c.id}`).expect(200)).body;
    expect(detail).toMatchObject({ ownedLessonCount: 3, completedLessonCount: 1, progressPercent: 33 });

    // Даалгаврын оноо quiz-ийн оролдлого, best_score-д огт бичигдэхгүй
    expect(await t.prisma.quizAttempt.count()).toBe(0);
    expect(await t.prisma.lessonProgress.count({ where: { bestScorePercent: { not: null } } })).toBe(0);
  });
});
