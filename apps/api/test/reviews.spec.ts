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
// Fixture-ууд: курс DB-д шууд, эрх HTTP худалдан авалтаар, үнэлгээ HTTP-ээр.
// ---------------------------------------------------------------------------

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  await s.agent.patch('/me').send({ name: 'Батболд Багш' }).expect(200);
  return s;
}

async function learner(email: string, name: string | null = null) {
  const s = await loginByEmail(t, email);
  await t.prisma.$transaction(
    (tx) => credits.grant(tx, { userId: s.user.id, credits: 200, source: 'ADMIN_ADJUST' }),
    CREDIT_TX_OPTIONS,
  );
  if (name) await s.agent.patch('/me').send({ name }).expect(200);
  return s;
}

async function admin(email = 'admin@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'ADMIN');
  return s;
}

let seq = 0;

/**
 * Нийтлэгдсэн курс: `published` ширхэг APPROVED lesson (5 кредит) + нийтэд харагдахгүй 1 IN_REVIEW, 1 архивласан
 * lesson (хувийн тооцоонд орохгүй). Курсийн бүтэн үнэ 20.
 */
async function course(teacherId: string, published = 10, status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Үнэлгээний курс ${++seq}`,
      priceCredits: 20,
      status,
      publishedAt: status === 'PUBLISHED' ? new Date(Date.now() - seq * 1000) : null,
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const specs = [
    ...Array.from({ length: published }, () => ({ reviewStatus: 'APPROVED' as const, archivedAt: null })),
    { reviewStatus: 'IN_REVIEW' as const, archivedAt: null },
    { reviewStatus: 'APPROVED' as const, archivedAt: new Date() },
  ];
  const lessons: string[] = [];
  for (const [i, s] of specs.entries()) {
    const l = await t.prisma.lesson.create({
      data: {
        courseId: row.id,
        sectionId: row.sections[0]!.id,
        title: `Хичээл ${i + 1}`,
        type: 'TEXT',
        position: i,
        priceCredits: 5,
        content: { markdown: 'агуулга' },
        ...s,
      },
    });
    lessons.push(l.id);
  }
  return { id: row.id, title: row.title, lessons: lessons.slice(0, published) };
}

const buyLesson = (a: Agent, lessonId: string) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);
const buyLessons = async (a: Agent, ids: string[]) => {
  for (const id of ids) await buyLesson(a, id);
};
const buyCourse = (a: Agent, courseId: string, expected = 20) =>
  a.post(`/purchases/courses/${courseId}`).send({ confirmNoRefund: true, expectedCredits: expected }).expect(201);

const review = (a: Agent, courseId: string, rating: number, body = '') => a.put(`/courses/${courseId}/review`).send({ rating, body });
const reviews = async (courseId: string, a?: Agent) =>
  (await (a ?? t.http()).get(`/catalog/courses/${courseId}/reviews`).expect(200)).body;
const notifications = (userId: string, type: string) =>
  t.prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'asc' } });

/** Эзэмшсэн нийтлэгдсэн lesson ≥ 30% (анхдагч тохиргоо) → үнэлгээтэй хэрэглэгч */
async function reviewer(email: string, c: { id: string; lessons: string[] }, rating: number, body = '', name: string | null = null) {
  const s = await learner(email, name);
  await buyLessons(s.agent, c.lessons.slice(0, 3));
  const res = await review(s.agent, c.id, rating, body).expect(200);
  return { ...s, review: res.body };
}

// ---------------------------------------------------------------------------

describe('Үнэлгээ — 30%-ийн нөхцөл', () => {
  it('10 нийтлэгдсэн lesson-оос 2 (20%) → 403, 3 (30%) → бичнэ; нийтэд харагдахгүй lesson тооцогдохгүй', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, 10);
    const l = await learner('l1@example.mn', 'Сараа');

    // Юу ч эзэмшээгүй
    let state = (await reviews(c.id, l.agent)).viewer;
    expect(state).toEqual({ eligible: false, ownedPercent: 0, requiredPercent: 30, isTeacher: false, review: null });
    expect((await review(l.agent, c.id, 5).expect(403)).body.code).toBe('REVIEW_NOT_ELIGIBLE');

    await buyLessons(l.agent, c.lessons.slice(0, 2));
    state = (await reviews(c.id, l.agent)).viewer;
    expect(state).toMatchObject({ eligible: false, ownedPercent: 20 });
    expect((await review(l.agent, c.id, 5).expect(403)).body.code).toBe('REVIEW_NOT_ELIGIBLE');
    expect(await t.prisma.review.count()).toBe(0);

    await buyLesson(l.agent, c.lessons[2]!);
    state = (await reviews(c.id, l.agent)).viewer;
    expect(state).toMatchObject({ eligible: true, ownedPercent: 30, review: null });

    const res = await review(l.agent, c.id, 4, '  Маш сайн тайлбарласан.  ').expect(200);
    expect(res.body).toMatchObject({
      courseId: c.id,
      rating: 4,
      body: 'Маш сайн тайлбарласан.',
      author: { id: l.user.id, name: 'Сараа' },
      editedAt: null,
      hidden: false,
      replies: [],
    });
    expect((await reviews(c.id, l.agent)).viewer.review).toMatchObject({ id: res.body.id, rating: 4 });
  });

  it('бүтэн курс авсан → эрхтэй; багш өөрийн курсийг үнэлэхгүй; зочин 401; нийтлэгдээгүй курс 404; буруу од 400', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, 4);
    const draft = await course(tch.user.id, 4, 'DRAFT');
    const full = await learner('full@example.mn');
    await buyCourse(full.agent, c.id);
    expect((await reviews(c.id, full.agent)).viewer).toMatchObject({ eligible: true, ownedPercent: 100 });
    await review(full.agent, c.id, 5).expect(200);

    expect((await reviews(c.id, tch.agent)).viewer).toMatchObject({ eligible: false, isTeacher: true });
    expect((await review(tch.agent, c.id, 5).expect(403)).body.code).toBe('REVIEW_OWN_COURSE');

    await t.http().put(`/courses/${c.id}/review`).send({ rating: 5 }).expect(401);
    expect((await reviews(c.id)).viewer).toBeNull();

    await review(full.agent, draft.id, 5).expect(404);
    await t.http().get(`/catalog/courses/${draft.id}/reviews`).expect(404);

    for (const rating of [0, 6, 4.5]) await review(full.agent, c.id, rating).expect(400);
    await full.agent.put(`/courses/${c.id}/review`).send({ rating: 5, body: 'х'.repeat(5001) }).expect(400);
  });

  it('босго тохиргооноос (reviewMinOwnedPercent)', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, 10);
    const a = await admin();
    await a.agent.put('/admin/settings/reviewMinOwnedPercent').send({ value: 50 }).expect(200);
    const l = await learner('l1@example.mn');
    await buyLessons(l.agent, c.lessons.slice(0, 4));
    expect((await review(l.agent, c.id, 5).expect(403)).body.message).toContain('50%');
    await buyLesson(l.agent, c.lessons[4]!);
    await review(l.agent, c.id, 5).expect(200);
  });
});

describe('Үнэлгээ — курс бүрт нэг, засах боломжтой', () => {
  it('дахин илгээвэл шинэ мөр үүсгэхгүй, засна (editedAt); багшид зөвхөн анх бичихэд мэдэгдэнэ', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const r = await reviewer('l1@example.mn', c, 5, 'Гайхалтай', 'Сараа');

    const edited = await review(r.agent, c.id, 2, 'Дараа нь бодлоо өөрчилсөн').expect(200);
    expect(edited.body).toMatchObject({ id: r.review.id, rating: 2, body: 'Дараа нь бодлоо өөрчилсөн' });
    expect(edited.body.editedAt).not.toBeNull();
    expect(await t.prisma.review.count()).toBe(1);

    const page = await reviews(c.id);
    expect(page.items).toHaveLength(1);
    expect(page.rating).toEqual({ average: 2, count: 1 });

    const ns = await notifications(tch.user.id, 'REVIEW_NEW');
    expect(ns).toHaveLength(1);
    expect(ns[0]!.params).toMatchObject({ course: c.title, rating: 5, name: 'Сараа' });
    expect(ns[0]!.link).toBe(`/courses/${c.id}#review-${r.review.id}`);
  });

  it('зэрэг 2 хүсэлт → нэг л үнэлгээ', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const l = await learner('l1@example.mn');
    await buyLessons(l.agent, c.lessons.slice(0, 3));
    const [a, b] = await Promise.all([review(l.agent, c.id, 5), review(l.agent, c.id, 3)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.id).toBe(b.body.id);
    expect(await t.prisma.review.count()).toBe(1);
  });
});

describe('Үнэлгээ — thread хариулт', () => {
  it('багш ба зохиогч хязгааргүй хариулна, нөгөө талдаа мэдэгдэнэ; бусад хэрэглэгч 403', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const r = await reviewer('l1@example.mn', c, 3, 'Дунд зэрэг', 'Сараа');
    const other = await reviewer('l2@example.mn', c, 5);

    await tch.agent.post(`/reviews/${r.review.id}/replies`).send({ body: 'Санал өгсөнд баярлалаа!' }).expect(201);
    await r.agent.post(`/reviews/${r.review.id}/replies`).send({ body: 'Дасгал нэмбэл сайн байна.' }).expect(201);
    const last = await tch.agent.post(`/reviews/${r.review.id}/replies`).send({ body: 'Нэмлээ.' }).expect(201);

    expect(last.body.replies.map((x: { body: string; byTeacher: boolean; author: { name: string } }) => [x.byTeacher, x.author.name, x.body])).toEqual([
      [true, 'Батболд Багш', 'Санал өгсөнд баярлалаа!'],
      [false, 'Сараа', 'Дасгал нэмбэл сайн байна.'],
      [true, 'Батболд Багш', 'Нэмлээ.'],
    ]);

    // Өөр хэрэглэгч (өөрөө үнэлгээтэй ч) бусдын thread-д бичихгүй; нэвтрээгүй 401; хоосон 400
    expect((await other.agent.post(`/reviews/${r.review.id}/replies`).send({ body: 'Би ч бас' }).expect(403)).body.code).toBe(
      'REVIEW_REPLY_FORBIDDEN',
    );
    await t.http().post(`/reviews/${r.review.id}/replies`).send({ body: 'x' }).expect(401);
    await tch.agent.post(`/reviews/${r.review.id}/replies`).send({ body: '   ' }).expect(400);

    expect(await notifications(r.user.id, 'REVIEW_REPLY')).toHaveLength(2);
    const toTeacher = await notifications(tch.user.id, 'REVIEW_REPLY');
    expect(toTeacher).toHaveLength(1);
    expect(toTeacher[0]!.params).toMatchObject({ course: c.title, name: 'Сараа' });

    const page = await reviews(c.id);
    expect(page.items.find((x: { id: string }) => x.id === r.review.id).replies).toHaveLength(3);
  });
});

describe('Үнэлгээ — админ нуух', () => {
  it('нуусан үнэлгээ нийтэд, дундажид орохгүй, зохиогч өөрийнхөө нуугдсаныг харна; audit, мэдэгдэл; сэргээнэ', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const good = await reviewer('l1@example.mn', c, 5);
    const bad = await reviewer('l2@example.mn', c, 1, 'Доромжилсон үг');
    const a = await admin();

    expect((await reviews(c.id)).rating).toEqual({ average: 3, count: 2 });

    // Эрх: админ биш 403
    await bad.agent.post(`/admin/reviews/${bad.review.id}/hide`).send({ reason: 'x' }).expect(403);
    await a.agent.post(`/admin/reviews/${bad.review.id}/hide`).send({ reason: '' }).expect(400);

    const hidden = await a.agent.post(`/admin/reviews/${bad.review.id}/hide`).send({ reason: 'Доромжлол' }).expect(200);
    expect(hidden.body).toMatchObject({ hidden: true, hiddenReason: 'Доромжлол', hiddenBy: { id: a.user.id }, course: { id: c.id } });
    // Давтвал idempotent (audit, мэдэгдэл давхардахгүй)
    await a.agent.post(`/admin/reviews/${bad.review.id}/hide`).send({ reason: 'Өөр' }).expect(200);

    const page = await reviews(c.id);
    expect(page.items.map((x: { id: string }) => x.id)).toEqual([good.review.id]);
    expect(page.rating).toEqual({ average: 5, count: 1 });
    expect((await t.http().get(`/catalog/courses/${c.id}`).expect(200)).body.rating).toEqual({ average: 5, count: 1 });

    const mine = (await reviews(c.id, bad.agent)).viewer.review;
    expect(mine).toMatchObject({ id: bad.review.id, hidden: true, hiddenReason: 'Доромжлол' });
    // Засахад нуугдсан хэвээр; нуугдсан үнэлгээнд хариулахгүй
    expect((await review(bad.agent, c.id, 2, 'Зассан').expect(200)).body.hidden).toBe(true);
    await tch.agent.post(`/reviews/${bad.review.id}/replies`).send({ body: 'хариу' }).expect(404);

    const audits = await t.prisma.auditLog.findMany({ where: { action: 'review.hide' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: a.user.id, targetType: 'review', targetId: bad.review.id });
    expect(audits[0]!.after).toMatchObject({ hidden: true, reason: 'Доромжлол', rating: 1, body: 'Доромжилсон үг' });
    const ns = await notifications(bad.user.id, 'REVIEW_HIDDEN');
    expect(ns).toHaveLength(1);
    expect(ns[0]!.params).toMatchObject({ course: c.title, reason: 'Доромжлол' });

    // Админы жагсаалт
    const hiddenList = (await a.agent.get('/admin/reviews?status=HIDDEN').expect(200)).body;
    expect(hiddenList.items.map((x: { id: string }) => x.id)).toEqual([bad.review.id]);
    expect((await a.agent.get('/admin/reviews?status=VISIBLE').expect(200)).body.items).toHaveLength(1);
    expect((await a.agent.get('/admin/reviews').expect(200)).body.items).toHaveLength(2);

    // Сэргээх
    await a.agent.post(`/admin/reviews/${bad.review.id}/unhide`).expect(200);
    expect((await reviews(c.id)).rating).toEqual({ average: 3.5, count: 2 });
    expect(await t.prisma.auditLog.count({ where: { action: 'review.unhide', targetId: bad.review.id } })).toBe(1);
  });

  it('хариултыг нууна (нийтэд харагдахгүй, админд тэмдэглэгээтэй), audit', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id);
    const r = await reviewer('l1@example.mn', c, 4);
    const a = await admin();
    const res = await r.agent.post(`/reviews/${r.review.id}/replies`).send({ body: 'зохисгүй хариулт' }).expect(201);
    const replyId = res.body.replies[0].id;

    await r.agent.post(`/admin/reviews/replies/${replyId}/hide`).send({ reason: 'x' }).expect(403);
    const adminView = await a.agent.post(`/admin/reviews/replies/${replyId}/hide`).send({ reason: 'Спам' }).expect(200);
    expect(adminView.body.replies[0]).toMatchObject({ id: replyId, hidden: true, hiddenReason: 'Спам' });
    expect((await reviews(c.id)).items[0].replies).toEqual([]);
    expect(await t.prisma.auditLog.count({ where: { action: 'review.reply.hide', targetId: replyId } })).toBe(1);

    await a.agent.post(`/admin/reviews/replies/${replyId}/unhide`).expect(200);
    expect((await reviews(c.id)).items[0].replies).toHaveLength(1);
  });
});

describe('Үнэлгээ — дундаж каталогт', () => {
  it('карт, дэлгэрэнгүйд дундаж/тоо; minRating шүүлтүүр, rating эрэмбэ (үнэлгээгүй нь сүүлд)', async () => {
    const tch = await teacher();
    const high = await course(tch.user.id, 4); // 5, 4 → 4.5
    const low = await course(tch.user.id, 4); // 3 → 3.0
    const none = await course(tch.user.id, 4);
    await reviewer('l1@example.mn', high, 5);
    await reviewer('l2@example.mn', high, 4);
    await reviewer('l3@example.mn', low, 3);

    const list = (await t.http().get('/catalog/courses?sort=rating').expect(200)).body;
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([high.id, low.id, none.id]);
    expect(list.items.map((x: { rating: unknown }) => x.rating)).toEqual([
      { average: 4.5, count: 2 },
      { average: 3, count: 1 },
      { average: null, count: 0 },
    ]);

    const ids = async (qs: string) =>
      (await t.http().get(`/catalog/courses?${qs}`).expect(200)).body.items.map((x: { id: string }) => x.id).sort();
    expect(await ids('minRating=4.5')).toEqual([high.id]);
    expect(await ids('minRating=3')).toEqual([high.id, low.id].sort());
    expect(await ids('minRating=5')).toEqual([]);

    expect((await t.http().get(`/catalog/courses/${high.id}`).expect(200)).body.rating).toEqual({ average: 4.5, count: 2 });
    expect((await t.http().get(`/catalog/teachers/${tch.user.id}`).expect(200)).body.courses).toHaveLength(3);
  });

  it('дундажийг нэг оронгоор бүхэлчилнэ (5, 4, 4 → 4.3)', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, 4);
    await reviewer('l1@example.mn', c, 5);
    await reviewer('l2@example.mn', c, 4);
    await reviewer('l3@example.mn', c, 4);
    expect((await reviews(c.id)).rating).toEqual({ average: 4.3, count: 3 });
    const card = (await t.http().get('/catalog/courses?minRating=4.3').expect(200)).body.items;
    expect(card.map((x: { rating: unknown }) => x.rating)).toEqual([{ average: 4.3, count: 3 }]);
  });

  it('жагсаалт шинэ нь эхэнд, хуудаслалттай', async () => {
    const tch = await teacher();
    const c = await course(tch.user.id, 4);
    const ids: string[] = [];
    for (const n of [1, 2, 3]) ids.push((await reviewer(`l${n}@example.mn`, c, 5)).review.id);
    const p1 = (await t.http().get(`/catalog/courses/${c.id}/reviews?limit=2`).expect(200)).body;
    expect(p1.items.map((x: { id: string }) => x.id)).toEqual([ids[2], ids[1]]);
    const p2 = (await t.http().get(`/catalog/courses/${c.id}/reviews?limit=2&before=${p1.nextCursor}`).expect(200)).body;
    expect(p2.items.map((x: { id: string }) => x.id)).toEqual([ids[0]]);
    expect(p2.nextCursor).toBeNull();
  });
});
