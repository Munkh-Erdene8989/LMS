import { QUIZ_ATTEMPT_COOLDOWN_SECONDS, QUIZ_ATTEMPTS_PER_DAY } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

jest.setTimeout(180_000);

/**
 * Ticket 12 үлдэгдэл: quiz оролдлогын хурдны хязгаар (хэрэглэгч × lesson) — 30 сек хүлээлт, гулсах 24 цагт 10.
 * Цагийг оролдлогын `created_at`-ийг DB-д хуучруулж дуурайна.
 */
let t: TestApp;
let credits: CreditsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Q1 = id(1), Q1A = id(11), Q1B = id(12);
const QUIZ = {
  passPercent: 100,
  questions: [{ id: Q1, text: '2 + 2 = ?', multiple: false, options: [{ id: Q1A, text: '3' }, { id: Q1B, text: '4' }], correctOptionIds: [Q1B] }],
};
const WRONG = [{ questionId: Q1, optionIds: [Q1A] }];

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

async function learner(email = 'learner@example.mn') {
  const s = await loginByEmail(t, email);
  await t.prisma.$transaction((tx) => credits.grant(tx, { userId: s.user.id, credits: 100, source: 'ADMIN_ADJUST' }), CREDIT_TX_OPTIONS);
  return s;
}

/** Нийтлэгдсэн курс, quiz lesson-ууд (DB-д шууд). */
async function quizCourse(teacherId: string, count = 1) {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: 'Quiz курс',
      priceCredits: 10,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1', position: 0 } },
    },
    include: { sections: true },
  });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const l = await t.prisma.lesson.create({
      data: {
        courseId: row.id,
        sectionId: row.sections[0]!.id,
        title: `Тест ${i + 1}`,
        type: 'QUIZ',
        position: i,
        priceCredits: 5,
        reviewStatus: 'APPROVED',
        content: QUIZ,
      },
    });
    ids.push(l.id);
  }
  return ids;
}

const buy = (a: Agent, lessonId: string) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);
const submit = (a: Agent, lessonId: string, answers = WRONG) => a.post(`/learning/lessons/${lessonId}/quiz-attempts`).send({ answers });

/** Тухайн хэрэглэгчийн оролдлогуудыг `seconds` секундээр хуучруулна (цаг урагшилсан мэт). */
const age = (userId: string, seconds: number) =>
  t.prisma.$executeRaw`UPDATE quiz_attempts SET created_at = created_at - make_interval(secs => ${seconds}) WHERE user_id = ${userId}::uuid`;

describe('Quiz оролдлогын хурдны хязгаар', () => {
  it('30 секундын хүлээлт: шууд дахин илгээхэд 429 (бичигдэхгүй), төлөвт дараагийн цаг; хүлээсний дараа болно', async () => {
    const tch = await teacher();
    const [quizId] = await quizCourse(tch.user.id);
    const u = await learner();
    await buy(u.agent, quizId!);

    let state = (await u.agent.get(`/learning/lessons/${quizId}`).expect(200)).body;
    expect(state.quiz.nextAttemptAt).toBeNull();

    const before = Date.now();
    const first = (await submit(u.agent, quizId!).expect(201)).body;
    const next = new Date(first.quiz.nextAttemptAt).getTime();
    expect(next - before).toBeGreaterThan((QUIZ_ATTEMPT_COOLDOWN_SECONDS - 5) * 1000);
    expect(next - before).toBeLessThanOrEqual((QUIZ_ATTEMPT_COOLDOWN_SECONDS + 5) * 1000);

    const res = await submit(u.agent, quizId!).expect(429);
    expect(res.body.code).toBe('QUIZ_RATE_LIMITED');
    expect(res.body.message).toMatch(/^Дахин оролдохын өмнө түр хүлээнэ үү — \d+ секундын дараа боломжтой\.$/);
    expect(await t.prisma.quizAttempt.count()).toBe(1);
    state = (await u.agent.get(`/learning/lessons/${quizId}`).expect(200)).body;
    expect(state.quiz.nextAttemptAt).toBe(first.quiz.nextAttemptAt);

    await age(u.user.id, QUIZ_ATTEMPT_COOLDOWN_SECONDS + 1);
    await submit(u.agent, quizId!).expect(201);
    expect(await t.prisma.quizAttempt.count()).toBe(2);
  });

  it(`24 цагт ${QUIZ_ATTEMPTS_PER_DAY} оролдлого: дараагийнх нь хамгийн эртний оролдлого цонхноос гарах хүртэл хаалттай`, async () => {
    const tch = await teacher();
    const [quizId, otherQuiz] = await quizCourse(tch.user.id, 2);
    const u = await learner();
    await buy(u.agent, quizId!);
    await buy(u.agent, otherQuiz!);

    for (let i = 0; i < QUIZ_ATTEMPTS_PER_DAY; i++) {
      await submit(u.agent, quizId!).expect(201);
      await age(u.user.id, 600); // 10 минут тутам (бодит хугацааны хазайлтад зай үлдээнэ)
    }
    const oldest = await t.prisma.quizAttempt.findFirstOrThrow({ where: { userId: u.user.id }, orderBy: { createdAt: 'asc' } });

    const res = await submit(u.agent, quizId!).expect(429);
    expect(res.body.code).toBe('QUIZ_RATE_LIMITED');
    expect(res.body.message).toContain(`24 цагт ${QUIZ_ATTEMPTS_PER_DAY} удаа`);
    expect(res.body.message).toContain('Улаанбаатарын цагаар');
    const state = (await u.agent.get(`/learning/lessons/${quizId}`).expect(200)).body;
    expect(new Date(state.quiz.nextAttemptAt).getTime()).toBe(oldest.createdAt.getTime() + 24 * 60 * 60_000);

    // Өөр lesson, өөр хэрэглэгчид нөлөөлөхгүй.
    await submit(u.agent, otherQuiz!).expect(201);
    const v = await learner('other@example.mn');
    await buy(v.agent, quizId!);
    await submit(v.agent, quizId!).expect(201);

    // Хамгийн эртний оролдлого 24 цагийн цонхноос гармагц дахин болно.
    await age(u.user.id, 24 * 60 * 60 - QUIZ_ATTEMPTS_PER_DAY * 600 + 60); // хамгийн эртнийх л цонхноос гарна
    await submit(u.agent, quizId!).expect(201);
    // Цонхонд дахин 10 болсон — хүлээлт өнгөрсөн ч өдрийн хязгаар.
    await age(u.user.id, QUIZ_ATTEMPT_COOLDOWN_SECONDS + 1);
    expect((await submit(u.agent, quizId!).expect(429)).body.message).toContain('24 цагт');
  });

  it('зэрэг илгээсэн хүсэлтүүдээс зөвхөн нэг нь бичигдэнэ', async () => {
    const tch = await teacher();
    const [quizId] = await quizCourse(tch.user.id);
    const u = await learner();
    await buy(u.agent, quizId!);

    const results = await Promise.all(Array.from({ length: 5 }, () => submit(u.agent, quizId!)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 429, 429, 429, 429]);
    expect(await t.prisma.quizAttempt.count()).toBe(1);
  });

  it('багш (өөрийн quiz), админд хязгаар үгүй', async () => {
    const tch = await teacher();
    const [quizId] = await quizCourse(tch.user.id);
    const admin = await loginByEmail(t, 'admin@example.mn');
    await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');

    for (const a of [tch.agent, admin.agent]) {
      for (let i = 0; i < 3; i++) {
        const r = (await submit(a, quizId!).expect(201)).body;
        expect(r.quiz.nextAttemptAt).toBeNull();
      }
    }
  });
});
