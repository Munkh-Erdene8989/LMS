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
// Fixture-ууд: курс DB-д шууд (зохиох урсгал catalog.spec.ts + энд quiz зохиох тест), эрх HTTP худалдан авалтаар.
// ---------------------------------------------------------------------------

// Тогтмол id-тай quiz: Q1 нэг сонголттой (зөв = B), Q2 олон сонголттой (зөв = A + C), Q3 нэг сонголттой (зөв = A).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q1 = id(1), Q1A = id(11), Q1B = id(12), Q1C = id(13);
const Q2 = id(2), Q2A = id(21), Q2B = id(22), Q2C = id(23);
const Q3 = id(3), Q3A = id(31), Q3B = id(32);

const QUIZ = {
  passPercent: 60,
  questions: [
    { id: Q1, text: '2 + 2 = ?', multiple: false, options: [{ id: Q1A, text: '3' }, { id: Q1B, text: '4' }, { id: Q1C, text: '5' }], correctOptionIds: [Q1B] },
    { id: Q2, text: 'Тэгш тоо', multiple: true, options: [{ id: Q2A, text: '2' }, { id: Q2B, text: '3' }, { id: Q2C, text: '4' }], correctOptionIds: [Q2A, Q2C] },
    { id: Q3, text: 'Монголын нийслэл', multiple: false, options: [{ id: Q3A, text: 'Улаанбаатар' }, { id: Q3B, text: 'Дархан' }], correctOptionIds: [Q3A] },
  ],
};

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
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
  archived?: boolean;
}

let seq = 0;

/** Анхдагч: TEXT, PDF, QUIZ, VIDEO (видео lesson ticket 10 хүртэл DB-д шууд). */
async function course(teacherId: string, lessons: LessonSpec[] = [{ type: 'TEXT' }, { type: 'PDF' }, { type: 'QUIZ' }, { type: 'VIDEO' }]) {
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
    const type = l.type ?? 'TEXT';
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
        archivedAt: l.archived ? new Date() : null,
        content:
          l.content ??
          (type === 'QUIZ' ? QUIZ : type === 'PDF' ? { fileKey: null, fileName: null, size: null } : type === 'TEXT' ? { markdown: 'агуулга' } : {}),
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
/**
 * Оролдлого. Хурдны хязгаар (30 сек / 24 цагт 10) энэ файлын оноо, эрхийн тестэд саад болохгүйн тулд өмнөх
 * оролдлогуудыг 25 цагаар хуучруулна (дараалал хэвээр). Хязгаарыг `quiz-rate-limit.spec.ts` шалгана.
 */
const attempt = (a: Agent, lessonId: string, answers: { questionId: string; optionIds: string[] }[]) => ({
  expect: async (status: number) => {
    await t.prisma.$executeRaw`UPDATE quiz_attempts SET created_at = created_at - interval '25 hours'`;
    return a.post(`/learning/lessons/${lessonId}/quiz-attempts`).send({ answers }).expect(status);
  },
});

/** Зөв хариулт (эсвэл түүнийг агуулсан талбар) хариунд байхгүй эсэх. */
function expectNoAnswers(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toContain('answerKey');
  expect(json).not.toContain('correctOption');
  expect(json).not.toMatch(/"correct"/);
}

// ---------------------------------------------------------------------------

describe('Quiz — эрх', () => {
  it('эрхгүй хэрэглэгч quiz-ийн асуулт харж, бөглөж чадахгүй (403), юу ч бичигдэхгүй; зочин 401', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const quizId = c.lessonIds[2]!;
    const u = await learner();

    const locked = await u.agent.get(`/catalog/lessons/${quizId}`).expect(403);
    expect(locked.body.code).toBe('LESSON_LOCKED');
    expectNoAnswers(locked.body);
    const res = await attempt(u.agent, quizId, [{ questionId: Q1, optionIds: [Q1B] }]).expect(403);
    expect(res.body.code).toBe('LESSON_LOCKED');
    await u.agent.get(`/learning/lessons/${quizId}`).expect(403);
    await u.agent.post(`/learning/lessons/${c.lessonIds[0]}/complete`).expect(403);
    await u.agent.post(`/learning/lessons/${c.lessonIds[3]}/progress`).send({ watchedPercent: 100 }).expect(403);
    await u.agent.get(`/learning/courses/${c.id}`).expect(404);

    await t.http().post(`/learning/lessons/${quizId}/quiz-attempts`).send({ answers: [] }).expect(401);
    await t.http().get('/learning/courses').expect(401);

    expect(await t.prisma.quizAttempt.count()).toBe(0);
    expect(await t.prisma.lessonProgress.count()).toBe(0);

    // Өөр lesson эзэмших нь quiz-д эрх өгөхгүй
    await buyLesson(u.agent, c.lessonIds[0]!);
    await attempt(u.agent, quizId, [{ questionId: Q1, optionIds: [Q1B] }]).expect(403);
    expect(await t.prisma.quizAttempt.count()).toBe(0);
  });

  it('эзэмшигчид асуулт, сонголт харагдана — зөв хариулт хэзээ ч client руу очихгүй (багшид ч learner view-д)', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const quizId = c.lessonIds[2]!;
    const u = await learner();
    await buyLesson(u.agent, quizId);

    const lesson = (await u.agent.get(`/catalog/lessons/${quizId}`).expect(200)).body;
    expect(lesson.access).toBe('OWNED');
    expect(lesson.content).toEqual({
      type: 'QUIZ',
      passPercent: 60,
      questions: QUIZ.questions.map(({ correctOptionIds: _c, ...q }) => q),
    });
    expectNoAnswers(lesson);

    const state = (await u.agent.get(`/learning/lessons/${quizId}`).expect(200)).body;
    expectNoAnswers(state);
    const result = (await attempt(u.agent, quizId, [{ questionId: Q1, optionIds: [Q1A] }]).expect(201)).body;
    expectNoAnswers(result);
    expect(Object.keys(result.attempt).sort()).toEqual(['correctCount', 'createdAt', 'id', 'passed', 'questionCount', 'scorePercent']);

    // Багш нийтийн (learner) endpoint-оор ч хариугүй; зөвхөн засварлах view-д
    const asTeacher = (await tch.agent.get(`/catalog/lessons/${quizId}`).expect(200)).body;
    expect(asTeacher.access).toBe('TEACHER');
    expectNoAnswers(asTeacher);
    const editor = (await tch.agent.get(`/teacher/courses/${c.id}`).expect(200)).body;
    expect(editor.sections[0].lessons[2].content.answerKey).toEqual({ [Q1]: [Q1B], [Q2]: [Q2A, Q2C], [Q3]: [Q3A] });
  });

  it('free preview quiz-ийг худалдан авалтгүй бөглөнө', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'QUIZ', preview: true }]);
    const u = await learner('u@example.mn', 0);
    const r = (await attempt(u.agent, c.lessonIds[0]!, [{ questionId: Q3, optionIds: [Q3A] }]).expect(201)).body;
    expect(r.attempt).toMatchObject({ correctCount: 1, questionCount: 3, scorePercent: 33, passed: false });
  });
});

describe('Quiz — оноо', () => {
  async function owner() {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const u = await learner();
    await buyLesson(u.agent, c.lessonIds[2]!);
    return { u, quizId: c.lessonIds[2]! };
  }

  it('нэг/олон сонголттой асуултын оноо: олон сонголттойд бүх зөвийг яг таг сонгосон үед л зөв', async () => {
    const { u, quizId } = await owner();
    const cases: { answers: { questionId: string; optionIds: string[] }[]; correct: number; percent: number; passed: boolean }[] = [
      // Бүгд зөв
      { answers: [{ questionId: Q1, optionIds: [Q1B] }, { questionId: Q2, optionIds: [Q2C, Q2A] }, { questionId: Q3, optionIds: [Q3A] }], correct: 3, percent: 100, passed: true },
      // Олон сонголттой: дутуу (A л) → буруу
      { answers: [{ questionId: Q1, optionIds: [Q1B] }, { questionId: Q2, optionIds: [Q2A] }, { questionId: Q3, optionIds: [Q3A] }], correct: 2, percent: 66, passed: true },
      // Олон сонголттой: илүү (A, B, C) → буруу; нэг сонголттой буруу
      { answers: [{ questionId: Q1, optionIds: [Q1A] }, { questionId: Q2, optionIds: [Q2A, Q2B, Q2C] }, { questionId: Q3, optionIds: [Q3A] }], correct: 1, percent: 33, passed: false },
      // Хариулаагүй асуулт буруу
      { answers: [{ questionId: Q2, optionIds: [Q2A, Q2C] }], correct: 1, percent: 33, passed: false },
      // Юу ч хариулаагүй
      { answers: [], correct: 0, percent: 0, passed: false },
      { answers: [{ questionId: Q1, optionIds: [] }], correct: 0, percent: 0, passed: false },
    ];
    for (const k of cases) {
      const r = (await attempt(u.agent, quizId, k.answers).expect(201)).body;
      expect(r.attempt).toMatchObject({ correctCount: k.correct, questionCount: 3, scorePercent: k.percent, passed: k.passed });
    }
    expect(await t.prisma.quizAttempt.count()).toBe(cases.length);
  });

  it('дахин оролдож болно; хамгийн өндөр оноо хадгалагдана; тэнцмэгц lesson дууссан', async () => {
    const { u, quizId } = await owner();

    let r = (await attempt(u.agent, quizId, [{ questionId: Q1, optionIds: [Q1B] }]).expect(201)).body;
    expect(r.attempt.scorePercent).toBe(33);
    expect(r.progress).toMatchObject({ completed: false, bestScorePercent: 33 });
    expect(r.quiz).toMatchObject({ passPercent: 60, questionCount: 3, bestScorePercent: 33, passed: false });

    r = (await attempt(u.agent, quizId, [{ questionId: Q1, optionIds: [Q1B] }, { questionId: Q3, optionIds: [Q3A] }]).expect(201)).body;
    expect(r.attempt).toMatchObject({ scorePercent: 66, passed: true });
    expect(r.progress).toMatchObject({ completed: true, bestScorePercent: 66 });

    // Муу оролдлого хамгийн өндөр оноо, дууссан төлөвийг бууруулахгүй
    r = (await attempt(u.agent, quizId, []).expect(201)).body;
    expect(r.attempt).toMatchObject({ scorePercent: 0, passed: false });
    expect(r.progress).toMatchObject({ completed: true, bestScorePercent: 66 });
    expect(r.quiz.attempts.map((a: { scorePercent: number }) => a.scorePercent)).toEqual([0, 66, 33]);

    const state = (await u.agent.get(`/learning/lessons/${quizId}`).expect(200)).body;
    expect(state.progress).toMatchObject({ completed: true, bestScorePercent: 66 });
    expect(state.quiz).toMatchObject({ bestScorePercent: 66, passed: true });
    expect(state.quiz.attempts).toHaveLength(3);

    // Quiz-ийг "дууслаа" товчоор дуусгахгүй
    expect((await u.agent.post(`/learning/lessons/${quizId}/complete`).expect(409)).body.code).toBe('COMPLETION_NOT_MANUAL');
  });

  it('буруу хариулт (байхгүй асуулт/сонголт, давхардал, нэг сонголттойд олон) → 400, оролдлого бичигдэхгүй', async () => {
    const { u, quizId } = await owner();
    const bad = [
      [{ questionId: id(999), optionIds: [] }],
      [{ questionId: Q1, optionIds: [Q2A] }],
      [{ questionId: Q1, optionIds: [Q1A, Q1B] }],
      [{ questionId: Q2, optionIds: [Q2A, Q2A] }],
      [{ questionId: Q1, optionIds: [Q1B] }, { questionId: Q1, optionIds: [Q1B] }],
    ];
    for (const answers of bad) {
      expect((await attempt(u.agent, quizId, answers).expect(400)).body.code).toBe('INVALID_ANSWERS');
    }
    await attempt(u.agent, quizId, [{ questionId: 'x', optionIds: [] }]).expect(400);
    expect(await t.prisma.quizAttempt.count()).toBe(0);
  });

  it('quiz биш lesson-д оролдлого → 400 NOT_A_QUIZ', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const u = await learner();
    await buyLesson(u.agent, c.lessonIds[0]!);
    expect((await attempt(u.agent, c.lessonIds[0]!, []).expect(400)).body.code).toBe('NOT_A_QUIZ');
  });
});

describe('Quiz зохиох (багш)', () => {
  it('асуулт, сонголт, зөв хариулт, тэнцэх оноо; дутуу quiz шалгуулахад бэлэн биш', async () => {
    const tch = await teacher();
    const created = (await tch.agent.post('/teacher/courses').send({ title: 'Quiz курс' }).expect(201)).body;
    const s = (await tch.agent.post(`/teacher/courses/${created.id}/sections`).send({ title: '1' }).expect(201)).body;
    const d = (await tch.agent.post(`/teacher/sections/${s.sections[0].id}/lessons`).send({ title: 'Шалгалт', type: 'QUIZ' }).expect(201)).body;
    const lesson = d.sections[0].lessons[0];
    expect(lesson.content).toEqual({ type: 'QUIZ', passPercent: 70, questions: [], answerKey: {} });
    expect(lesson.problems).toContain('Quiz-д асуулт алга');

    const patch = (content: unknown) => tch.agent.patch(`/teacher/lessons/${lesson.id}`).send({ content });
    let view = (
      await patch({
        passPercent: 50,
        questions: [
          { text: 'Нэг', multiple: false, options: [{ text: 'a', correct: false }, { text: 'b', correct: true }] },
          { text: 'Олон', multiple: true, options: [{ text: 'x', correct: true }, { text: 'y', correct: true }, { text: 'z', correct: false }] },
        ],
      }).expect(200)
    ).body.sections[0].lessons[0];
    expect(view.problems).toEqual([]);
    const [q1, q2] = view.content.questions;
    expect(view.content.passPercent).toBe(50);
    expect(view.content.answerKey).toEqual({ [q1.id]: [q1.options[1].id], [q2.id]: [q2.options[0].id, q2.options[1].id] });

    // id-г хадгалж засварлана; нэг сонголттойд 2 зөв, зөвгүй асуулт → problems
    view = (
      await patch({
        passPercent: 50,
        questions: [
          { id: q1.id, text: 'Нэг', multiple: false, options: [{ id: q1.options[0].id, text: 'a', correct: true }, { id: q1.options[1].id, text: 'b', correct: true }] },
          { id: q2.id, text: 'Олон', multiple: true, options: [{ text: 'x', correct: false }, { text: 'y', correct: false }] },
        ],
      }).expect(200)
    ).body.sections[0].lessons[0];
    expect(view.content.questions[0].id).toBe(q1.id);
    expect(view.content.questions[0].options[0].id).toBe(q1.options[0].id);
    expect(view.problems).toEqual(['1-р асуулт: нэг сонголттой асуултад нэг л зөв хариулт', '2-р асуулт: зөв хариулт сонгоогүй']);

    expect((await patch({ passPercent: 101, questions: [] }).expect(400)).body.code).toBe('CONTENT_TYPE_MISMATCH');
    expect((await patch({ markdown: 'x' }).expect(400)).body.code).toBe('CONTENT_TYPE_MISMATCH');
  });
});

describe('Явц ба "Миний сургалт"', () => {
  it('текст/PDF "дууслаа", видео ≥90%, quiz тэнцэх → курсийн явцын хувь; үргэлжлүүлэх lesson', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const [text, pdf, quiz, video] = c.lessonIds as [string, string, string, string];
    const other = await course(tch.user.id, [{ type: 'TEXT' }]);
    const u = await learner();

    expect((await u.agent.get('/learning/courses').expect(200)).body).toEqual([]);
    await buyCourse(u.agent, c.id, 10);
    await buyLesson(u.agent, other.lessonIds[0]!);

    let list = (await u.agent.get('/learning/courses').expect(200)).body;
    expect(list).toHaveLength(2);
    const card = () => list.find((x: { id: string }) => x.id === c.id);
    expect(card()).toMatchObject({ ownsCourse: true, lessonCount: 4, ownedLessonCount: 4, completedLessonCount: 0, progressPercent: 0, continueLessonId: text, lastViewedAt: null });
    expect(list.find((x: { id: string }) => x.id === other.id)).toMatchObject({ ownsCourse: false, ownedLessonCount: 1 });

    // Текст: нээсэн → үргэлжлүүлэх нь тэр; "дууслаа"
    await u.agent.post(`/learning/lessons/${text}/progress`).send({}).expect(200);
    const done = (await u.agent.post(`/learning/lessons/${text}/complete`).expect(200)).body;
    expect(done).toMatchObject({ lessonId: text, completed: true });
    await u.agent.post(`/learning/lessons/${text}/complete`).expect(200); // давтахад өөрчлөгдөхгүй

    // Видео: 89% дуусаагүй, үргэлжлүүлэх = видео; 95% дууссан; дараа нь бага хувь бууруулахгүй
    let p = (await u.agent.post(`/learning/lessons/${video}/progress`).send({ watchedPercent: 89.6 }).expect(200)).body;
    expect(p).toMatchObject({ completed: false, watchedPercent: 89 });
    list = (await u.agent.get('/learning/courses').expect(200)).body;
    expect(card()).toMatchObject({ completedLessonCount: 1, progressPercent: 25, continueLessonId: video });
    p = (await u.agent.post(`/learning/lessons/${video}/progress`).send({ watchedPercent: 95 }).expect(200)).body;
    expect(p).toMatchObject({ completed: true, watchedPercent: 95 });
    p = (await u.agent.post(`/learning/lessons/${video}/progress`).send({ watchedPercent: 10 }).expect(200)).body;
    expect(p).toMatchObject({ completed: true, watchedPercent: 95 });
    expect((await u.agent.post(`/learning/lessons/${video}/complete`).expect(409)).body.code).toBe('COMPLETION_NOT_MANUAL');
    await u.agent.post(`/learning/lessons/${video}/progress`).send({ watchedPercent: 101 }).expect(400);

    // Сүүлд үзсэн нь дууссан → дараалал дахь эхний дуусаагүй (PDF)
    list = (await u.agent.get('/learning/courses').expect(200)).body;
    expect(card()).toMatchObject({ completedLessonCount: 2, progressPercent: 50, continueLessonId: pdf });

    await u.agent.post(`/learning/lessons/${pdf}/complete`).expect(200);
    await attempt(u.agent, quiz, [{ questionId: Q1, optionIds: [Q1B] }, { questionId: Q3, optionIds: [Q3A] }]).expect(201);

    const detail = (await u.agent.get(`/learning/courses/${c.id}`).expect(200)).body;
    expect(detail).toMatchObject({ ownsCourse: true, ownedLessonCount: 4, completedLessonCount: 4, progressPercent: 100, continueLessonId: null });
    const lessons = detail.sections[0].lessons;
    expect(lessons.map((l: { id: string }) => l.id)).toEqual([text, pdf, quiz, video]);
    expect(lessons[2]).toMatchObject({ type: 'QUIZ', owned: true, progress: { completed: true, bestScorePercent: 66 } });
    expect(lessons[3].progress).toMatchObject({ watchedPercent: 95, completed: true });

    // Сүүлд үзсэн курс эхэнд
    list = (await u.agent.get('/learning/courses').expect(200)).body;
    expect(list[0].id).toBe(c.id);
  });

  it('хэсэгчлэн эзэмшсэн курс: явц эзэмшсэн lesson-оор; эзэмшээгүй нь түгжээтэй; архивласан эзэмшсэн lesson харагдана (хувьд тооцохгүй)', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }, { type: 'TEXT' }, { type: 'TEXT' }, { type: 'TEXT' }]);
    const [a, b, , d] = c.lessonIds as [string, string, string, string];
    const u = await learner();
    await buyLesson(u.agent, a);
    await buyLesson(u.agent, b);
    await buyLesson(u.agent, d);
    await u.agent.post(`/learning/lessons/${a}/complete`).expect(200);
    await t.prisma.lesson.update({ where: { id: d }, data: { archivedAt: new Date() } });

    const detail = (await u.agent.get(`/learning/courses/${c.id}`).expect(200)).body;
    expect(detail).toMatchObject({ ownsCourse: false, ownedLessonCount: 2, completedLessonCount: 1, progressPercent: 50, continueLessonId: b });
    const lessons = detail.sections[0].lessons as { id: string; owned: boolean; archived: boolean }[];
    expect(lessons.map((l) => [l.id, l.owned, l.archived])).toEqual([
      [a, true, false],
      [b, true, false],
      [c.lessonIds[2], false, false],
      [d, true, true],
    ]);
    // Архивласан эзэмшсэн lesson-ы явц бичигдэнэ (эзэмшигч контентоо үзсээр)
    await u.agent.post(`/learning/lessons/${d}/complete`).expect(200);
    // Өөр хэрэглэгчид архивласан lesson байхгүй
    const v = await learner('v@example.mn', 0);
    await v.agent.post(`/learning/lessons/${d}/complete`).expect(404);

    const card = (await u.agent.get('/learning/courses').expect(200)).body[0];
    expect(card).toMatchObject({ lessonCount: 3, ownedLessonCount: 2, completedLessonCount: 1, progressPercent: 50 });
  });

  it('явц хэрэглэгч бүрт тусдаа', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, [{ type: 'TEXT' }]);
    const u = await learner();
    const v = await learner('v@example.mn');
    await buyCourse(u.agent, c.id, 10);
    await buyCourse(v.agent, c.id, 10);
    await u.agent.post(`/learning/lessons/${c.lessonIds[0]}/complete`).expect(200);
    expect((await v.agent.get(`/learning/courses/${c.id}`).expect(200)).body.progressPercent).toBe(0);
    expect((await u.agent.get(`/learning/courses/${c.id}`).expect(200)).body.progressPercent).toBe(100);
  });
});
