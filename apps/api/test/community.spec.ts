import type { LessonReviewStatus, LessonType, Prisma } from '@lms/db';
import { COMMUNITY_IMAGE_MAX_BYTES } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

jest.setTimeout(240_000);

let t: TestApp;
let credits: CreditsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Session = Awaited<ReturnType<typeof loginByEmail>>;
type Agent = Session['agent'];

const HOUR = 60 * 60_000;

// ---------------------------------------------------------------------------
// Fixture-ууд: курс DB-д шууд, эрх HTTP худалдан авалтаар.
// ---------------------------------------------------------------------------

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

async function learner(email: string, balance = 100) {
  const s = await loginByEmail(t, email);
  await t.prisma.user.update({ where: { id: s.user.id }, data: { name: email.split('@')[0] } });
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
  reviewStatus?: LessonReviewStatus;
  title?: string;
}

let seq = 0;

async function course(teacherId: string, lessons: LessonSpec[] = [{}, {}], status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') {
  const row = await t.prisma.course.create({
    data: {
      teacherId,
      title: `Курс ${++seq}`,
      priceCredits: 10,
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const ids: string[] = [];
  for (const [i, l] of lessons.entries()) {
    const lesson = await t.prisma.lesson.create({
      data: {
        courseId: row.id,
        sectionId: row.sections[0]!.id,
        title: l.title ?? `Хичээл ${i + 1}`,
        type: l.type ?? 'TEXT',
        position: i,
        priceCredits: 5,
        reviewStatus: l.reviewStatus ?? 'APPROVED',
        content: l.content ?? { markdown: 'агуулга' },
      },
    });
    ids.push(lesson.id);
  }
  return { id: row.id, lessonIds: ids };
}

function live(startsInMs: number, durationMinutes = 60): Prisma.InputJsonValue {
  return {
    startsAt: new Date(Date.now() + startsInMs).toISOString(),
    durationMinutes,
    meetingUrl: 'https://meet.example.com/abc',
  };
}

const buyLesson = (a: Agent, lessonId: string) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);
const buyCourse = (a: Agent, courseId: string, expected: number) =>
  a.post(`/purchases/courses/${courseId}`).send({ confirmNoRefund: true, expectedCredits: expected }).expect(201);

const post = (a: Agent, teacherId: string, body: object) => a.post(`/communities/${teacherId}/posts`).send(body);
const comment = (a: Agent, postId: string, body: string) => a.post(`/community/posts/${postId}/comments`).send({ body });
const feed = (a: Agent, teacherId: string, q = '') => a.get(`/communities/${teacherId}/posts${q}`);

/** Багш + нэг курс + lesson худалдаж авсан гишүүн. */
async function setup() {
  const tch = await teacher();
  const c = await course(tch.user.id);
  const m = await learner('member@example.mn');
  await buyLesson(m.agent, c.lessonIds[0]!);
  return { tch, c, m, teacherId: tch.user.id as string };
}

/** Browser upload хийсэн мэт: ticket авч, fake storage-д объект үүсгэнэ. */
async function uploadImage(a: Agent, teacherId: string, size = 1000, contentType = 'image/png') {
  const tk = (await a.post(`/communities/${teacherId}/uploads`).send({ fileName: 'a.png', size: Math.min(size, COMMUNITY_IMAGE_MAX_BYTES), contentType }).expect(201)).body;
  t.storage.put('private', tk.key, { size, contentType });
  return tk.key as string;
}

// ---------------------------------------------------------------------------

describe('Community — гишүүнчлэл', () => {
  it('гишүүнчлэл entitlement-ээс: lesson эсвэл бүтэн курс эзэмшигч гишүүн, бусад 403, зочин 401, багш биш id 404', async () => {
    const tch = await teacher();
    const other = await teacher('other@example.mn');
    const c1 = await course(tch.user.id);
    const c2 = await course(tch.user.id);
    const oc = await course(other.user.id);
    const teacherId = tch.user.id as string;

    const byLesson = await learner('l1@example.mn');
    const byCourse = await learner('l2@example.mn');
    const outsider = await learner('l3@example.mn');
    const adm = await admin();

    await t.http().get(`/communities/${teacherId}`).expect(401);

    // Худалдан авахаас өмнө гишүүн биш
    expect((await byLesson.agent.get(`/communities/${teacherId}`).expect(403)).body.code).toBe('COMMUNITY_MEMBERS_ONLY');

    await buyLesson(byLesson.agent, c1.lessonIds[1]!);
    await buyCourse(byCourse.agent, c2.id, 10);
    // Өөр багшийн lesson эзэмших хангалтгүй
    await buyLesson(outsider.agent, oc.lessonIds[0]!);

    const ov = (await byLesson.agent.get(`/communities/${teacherId}`).expect(200)).body;
    expect(ov.role).toBe('MEMBER');
    expect(ov.memberCount).toBe(2);
    expect(ov.teacher.id).toBe(teacherId);
    expect((await byCourse.agent.get(`/communities/${teacherId}`).expect(200)).body.role).toBe('MEMBER');
    expect((await tch.agent.get(`/communities/${teacherId}`).expect(200)).body.role).toBe('TEACHER');
    expect((await adm.agent.get(`/communities/${teacherId}`).expect(200)).body.role).toBe('ADMIN');

    // Гишүүн биш: бүх endpoint 403
    for (const res of [
      await outsider.agent.get(`/communities/${teacherId}`),
      await feed(outsider.agent, teacherId),
      await post(outsider.agent, teacherId, { body: 'сайн уу' }),
      await outsider.agent.post(`/communities/${teacherId}/uploads`).send({ fileName: 'a.png', size: 10, contentType: 'image/png' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('COMMUNITY_MEMBERS_ONLY');
    }
    const p = (await post(byLesson.agent, teacherId, { body: 'Сайн байна уу' }).expect(201)).body;
    for (const res of [
      await outsider.agent.get(`/community/posts/${p.id}/comments`),
      await comment(outsider.agent, p.id, 'x'),
      await outsider.agent.put(`/community/posts/${p.id}/like`),
      await outsider.agent.delete(`/community/posts/${p.id}`),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('COMMUNITY_MEMBERS_ONLY');
    }

    // Багш биш хэрэглэгчийн id → 404
    expect((await byLesson.agent.get(`/communities/${byCourse.user.id}`).expect(404)).body.code).toBe('COMMUNITY_NOT_FOUND');

    // Миний community-ууд
    const mine = (await outsider.agent.get('/communities').expect(200)).body;
    expect(mine.map((c: { teacher: { id: string } }) => c.teacher.id)).toEqual([other.user.id]);
    const mineL = (await byLesson.agent.get('/communities').expect(200)).body;
    expect(mineL).toEqual([
      expect.objectContaining({ teacher: expect.objectContaining({ id: teacherId }), role: 'MEMBER', postCount: 1 }),
    ]);
    const mineT = (await tch.agent.get('/communities').expect(200)).body;
    expect(mineT[0]).toEqual(expect.objectContaining({ role: 'TEACHER', postCount: 1 }));
  });
});

describe('Community — нийтлэл, зураг, like, сэтгэгдэл', () => {
  it('текст / зурагтай нийтлэл; хоосон 400; зургийн шалгалт; шинэ нь эхэндээ, cursor-оор хуудаслана', async () => {
    const { tch, m, teacherId } = await setup();

    expect((await post(m.agent, teacherId, {}).expect(400)).body.code).toBe('EMPTY_POST');
    expect((await post(m.agent, teacherId, { body: '   ' }).expect(400)).body.code).toBe('EMPTY_POST');

    const p1 = (await post(m.agent, teacherId, { body: '**Сайн уу** бүгдээрээ' }).expect(201)).body;
    expect(p1).toEqual(
      expect.objectContaining({
        body: '**Сайн уу** бүгдээрээ',
        imageUrl: null,
        pinned: false,
        likeCount: 0,
        likedByMe: false,
        commentCount: 0,
        canDelete: true,
        author: expect.objectContaining({ id: m.user.id, name: 'member', isTeacher: false }),
      }),
    );

    // Зураг: ticket → upload → нийтлэл (зөвхөн зурагтай ч болно)
    const key = await uploadImage(m.agent, teacherId);
    expect(key.startsWith(`community/${teacherId}/${m.user.id}/`)).toBe(true);
    const p2 = (await post(m.agent, teacherId, { imageKey: key }).expect(201)).body;
    expect(p2.imageUrl).toContain(`/signed/private/${key}`);

    // Зургийн алдаанууд
    const bad = await m.agent.post(`/communities/${teacherId}/uploads`).send({ fileName: 'a.pdf', size: 10, contentType: 'application/pdf' });
    expect(bad.body.code).toBe('INVALID_IMAGE');
    const big = await m.agent.post(`/communities/${teacherId}/uploads`).send({ fileName: 'a.png', size: COMMUNITY_IMAGE_MAX_BYTES + 1, contentType: 'image/png' });
    expect(big.body.code).toBe('IMAGE_TOO_LARGE');
    const notUploaded = await post(m.agent, teacherId, { imageKey: `community/${teacherId}/${m.user.id}/nope.png` }).expect(400);
    expect(notUploaded.body.code).toBe('INVALID_IMAGE');
    // Бусдын зам
    expect((await post(tch.agent, teacherId, { imageKey: key }).expect(400)).body.code).toBe('INVALID_IMAGE');
    // Хэмжээ хэтэрсэн upload — устгагдана
    const hugeKey = await uploadImage(m.agent, teacherId, COMMUNITY_IMAGE_MAX_BYTES + 1);
    expect((await post(m.agent, teacherId, { imageKey: hugeKey }).expect(400)).body.code).toBe('IMAGE_TOO_LARGE');
    expect(await t.storage.info('private', hugeKey)).toBeNull();

    const p3 = (await post(tch.agent, teacherId, { body: 'Багшийн мэндчилгээ' }).expect(201)).body;
    expect(p3.author.isTeacher).toBe(true);

    const all = (await feed(m.agent, teacherId).expect(200)).body;
    expect(all.items.map((p: { id: string }) => p.id)).toEqual([p3.id, p2.id, p1.id]);
    expect(all.pinned).toEqual([]);
    // Гишүүн өөрийнхөө нийтлэлийг л устгах эрхтэй харагдана
    expect(all.items.map((p: { canDelete: boolean }) => p.canDelete)).toEqual([false, true, true]);
    expect((await feed(tch.agent, teacherId).expect(200)).body.items.every((p: { canDelete: boolean }) => p.canDelete)).toBe(true);

    const page1 = (await feed(m.agent, teacherId, '?limit=2').expect(200)).body;
    expect(page1.items).toHaveLength(2);
    const page2 = (await feed(m.agent, teacherId, `?limit=2&before=${page1.nextCursor}`).expect(200)).body;
    expect(page2.items.map((p: { id: string }) => p.id)).toEqual([p1.id]);
    expect(page2.nextCursor).toBeNull();
  });

  it('like idempotent; сэтгэгдэл; зохиогч болон оролцогчдод мэдэгдэл (өөрт нь биш)', async () => {
    const { tch, m, teacherId, c } = await setup();
    const m2 = await learner('second@example.mn');
    await buyLesson(m2.agent, c.lessonIds[1]!);

    const p = (await post(m.agent, teacherId, { body: 'Асуулт байна' }).expect(201)).body;

    expect((await m2.agent.put(`/community/posts/${p.id}/like`).expect(200)).body).toEqual({ liked: true, likeCount: 1 });
    expect((await m2.agent.put(`/community/posts/${p.id}/like`).expect(200)).body).toEqual({ liked: true, likeCount: 1 });
    await tch.agent.put(`/community/posts/${p.id}/like`).expect(200);
    const seen = (await feed(m2.agent, teacherId).expect(200)).body.items[0];
    expect(seen).toEqual(expect.objectContaining({ likeCount: 2, likedByMe: true }));
    expect((await feed(m.agent, teacherId).expect(200)).body.items[0].likedByMe).toBe(false);
    expect((await m2.agent.delete(`/community/posts/${p.id}/like`).expect(200)).body).toEqual({ liked: false, likeCount: 1 });

    // Хоосон сэтгэгдэл
    expect((await comment(m2.agent, p.id, '   ').expect(400)).body.code).toBe('EMPTY_COMMENT');

    // m2 сэтгэгдэл → зохиогч (m) мэдэгдэл авна
    const c1 = (await comment(m2.agent, p.id, 'Би ч гэсэн сонирхож байна').expect(201)).body;
    expect(c1.author.id).toBe(m2.user.id);
    // Зохиогч өөрөө хариулав → m2 (оролцогч) мэдэгдэл авна, m өөртөө авахгүй
    await comment(m.agent, p.id, 'Баярлалаа').expect(201);
    // Багш хариулав → m (зохиогч) + m2 (оролцогч)
    await comment(tch.agent, p.id, 'Дараагийн хичээлээр тайлбарлая').expect(201);

    const notes = await t.prisma.notification.findMany({
      where: { type: { in: ['COMMUNITY_POST_COMMENT', 'COMMUNITY_THREAD_COMMENT'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(notes.map((n) => [n.userId, n.type])).toEqual([
      [m.user.id, 'COMMUNITY_POST_COMMENT'],
      [m2.user.id, 'COMMUNITY_THREAD_COMMENT'],
      [m.user.id, 'COMMUNITY_POST_COMMENT'],
      [m2.user.id, 'COMMUNITY_THREAD_COMMENT'],
    ]);
    expect(notes[0]!.link).toBe(`/communities/${teacherId}?post=${p.id}`);
    expect(await t.prisma.notification.count({ where: { userId: tch.user.id, type: { startsWith: 'COMMUNITY_' } } })).toBe(0);
    // In-app текст translation-аас
    const inbox = (await m.agent.get('/notifications').expect(200)).body.items;
    expect(inbox[0].title).toContain('таны нийтлэлд сэтгэгдэл бичлээ');
    expect(inbox[0].body).toContain('Асуулт байна');

    const list = (await m.agent.get(`/community/posts/${p.id}/comments`).expect(200)).body;
    expect(list.items.map((x: { body: string }) => x.body)).toEqual(['Би ч гэсэн сонирхож байна', 'Баярлалаа', 'Дараагийн хичээлээр тайлбарлая']);
    expect(list.items.map((x: { canDelete: boolean }) => x.canDelete)).toEqual([false, true, false]);
    expect(list.items[2].author.isTeacher).toBe(true);
    const paged = (await m.agent.get(`/community/posts/${p.id}/comments?limit=2`).expect(200)).body;
    const rest = (await m.agent.get(`/community/posts/${p.id}/comments?limit=2&after=${paged.nextCursor}`).expect(200)).body;
    expect(rest.items.map((x: { body: string }) => x.body)).toEqual(['Дараагийн хичээлээр тайлбарлая']);
    expect((await feed(m.agent, teacherId).expect(200)).body.items[0].commentCount).toBe(3);
  });

  it('pin: зөвхөн багш, pin-тэй нь тусдаа эхэнд, 3-аас олон 409, болиулна', async () => {
    const { tch, m, teacherId } = await setup();
    const adm = await admin();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await post(m.agent, teacherId, { body: `Нийтлэл ${i}` }).expect(201)).body.id);

    expect((await m.agent.put(`/community/posts/${ids[0]}/pin`).expect(403)).body.code).toBe('COMMUNITY_TEACHER_ONLY');
    expect((await adm.agent.put(`/community/posts/${ids[0]}/pin`).expect(403)).body.code).toBe('COMMUNITY_TEACHER_ONLY');

    expect((await tch.agent.put(`/community/posts/${ids[0]}/pin`).expect(200)).body.pinned).toBe(true);
    await tch.agent.put(`/community/posts/${ids[1]}/pin`).expect(200);
    await tch.agent.put(`/community/posts/${ids[2]}/pin`).expect(200);
    // Дахин pin — idempotent
    await tch.agent.put(`/community/posts/${ids[2]}/pin`).expect(200);
    expect((await tch.agent.put(`/community/posts/${ids[3]}/pin`).expect(409)).body.code).toBe('PIN_LIMIT');

    const f = (await feed(m.agent, teacherId).expect(200)).body;
    expect(f.pinned.map((p: { id: string }) => p.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect(f.items.map((p: { id: string }) => p.id)).toEqual([ids[4], ids[3]]);
    // Дараагийн хуудсанд pin-тэй нь давтагдахгүй
    expect((await feed(m.agent, teacherId, `?before=${ids[4]}`).expect(200)).body.pinned).toEqual([]);

    expect((await tch.agent.delete(`/community/posts/${ids[0]}/pin`).expect(200)).body.pinned).toBe(false);
    await tch.agent.put(`/community/posts/${ids[3]}/pin`).expect(200);
    expect((await feed(m.agent, teacherId).expect(200)).body.items.map((p: { id: string }) => p.id)).toEqual([ids[4], ids[0]]);
  });
});

describe('Community — moderation', () => {
  it('гишүүн бусдын нийтлэл/сэтгэгдлийг устгахгүй; зохиогч өөрийнхөө; багш/админ бүгдийг (audit log-д)', async () => {
    const { tch, m, teacherId, c } = await setup();
    const m2 = await learner('second@example.mn');
    await buyLesson(m2.agent, c.lessonIds[1]!);
    const adm = await admin();

    const key = await uploadImage(m.agent, teacherId);
    const p = (await post(m.agent, teacherId, { body: 'Зар сурталчилгаа', imageKey: key }).expect(201)).body;
    const cm = (await comment(m.agent, p.id, 'спам').expect(201)).body;
    await m2.agent.put(`/community/posts/${p.id}/like`).expect(200);

    expect((await m2.agent.delete(`/community/posts/${p.id}`).expect(403)).body.code).toBe('FORBIDDEN');
    expect((await m2.agent.delete(`/community/comments/${cm.id}`).expect(403)).body.code).toBe('FORBIDDEN');

    // Багш сэтгэгдэл устгав → audit
    await tch.agent.delete(`/community/comments/${cm.id}`).expect(204);
    // Багш нийтлэл устгав → сэтгэгдэл, like хамт устаж, зураг storage-оос устна, audit
    await comment(m2.agent, p.id, 'хариу').expect(201);
    await tch.agent.delete(`/community/posts/${p.id}`).expect(204);
    expect(await t.prisma.communityPost.count()).toBe(0);
    expect(await t.prisma.communityComment.count()).toBe(0);
    expect(await t.prisma.communityLike.count()).toBe(0);
    expect(await t.storage.info('private', key)).toBeNull();
    await tch.agent.delete(`/community/posts/${p.id}`).expect(404);

    const audit = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'community.' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => [a.action, a.actorId, a.targetId])).toEqual([
      ['community.comment.delete', tch.user.id, cm.id],
      ['community.post.delete', tch.user.id, p.id],
    ]);
    expect(audit[1]!.before).toEqual(expect.objectContaining({ authorId: m.user.id, body: 'Зар сурталчилгаа', imageKey: key }));

    // Зохиогч өөрийнхөө — audit-гүй
    const own = (await post(m2.agent, teacherId, { body: 'миний' }).expect(201)).body;
    await m2.agent.delete(`/community/posts/${own.id}`).expect(204);
    // Админ (платформын модератор)
    const other = (await post(m2.agent, teacherId, { body: 'бас нэг' }).expect(201)).body;
    await adm.agent.delete(`/community/posts/${other.id}`).expect(204);
    expect(await t.prisma.auditLog.count({ where: { action: 'community.post.delete' } })).toBe(2);
  });

  it('багш гишүүн хасна: бүх endpoint-д 403 COMMUNITY_REMOVED, lesson-ы эрх хэвээр, мэдэгдэл очихгүй; сэргээнэ', async () => {
    const { tch, m, teacherId, c } = await setup();
    const m2 = await learner('second@example.mn');
    await buyLesson(m2.agent, c.lessonIds[1]!);
    const outsider = await learner('outsider@example.mn');

    const p = (await post(m2.agent, teacherId, { body: 'Сайн уу' }).expect(201)).body;
    await comment(m.agent, p.id, 'Сайн').expect(201);

    // Гишүүдийн жагсаалт — зөвхөн багш
    await m.agent.get('/teacher/community/members').expect(403);
    const members = (await tch.agent.get('/teacher/community/members').expect(200)).body.items;
    expect(members.map((x: { id: string }) => x.id).sort()).toEqual([m.user.id, m2.user.id].sort());
    expect(members.every((x: { removed: unknown }) => x.removed === null)).toBe(true);

    // Гишүүн биш хэрэглэгчийг хасахгүй
    expect((await tch.agent.post(`/teacher/community/members/${outsider.user.id}/remove`).send({}).expect(404)).body.code).toBe('MEMBER_NOT_FOUND');
    expect((await tch.agent.post(`/teacher/community/members/${tch.user.id}/remove`).send({}).expect(404)).body.code).toBe('MEMBER_NOT_FOUND');

    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({ reason: 'Спам' }).expect(204);
    // Давтан — өөрчлөлтгүй
    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({}).expect(204);

    for (const res of [
      await m.agent.get(`/communities/${teacherId}`),
      await feed(m.agent, teacherId),
      await post(m.agent, teacherId, { body: 'буцаад ирлээ' }),
      await m.agent.post(`/communities/${teacherId}/uploads`).send({ fileName: 'a.png', size: 10, contentType: 'image/png' }),
      await m.agent.get(`/community/posts/${p.id}/comments`),
      await comment(m.agent, p.id, 'x'),
      await m.agent.put(`/community/posts/${p.id}/like`),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('COMMUNITY_REMOVED');
    }
    // Шинэ худалдан авалт хасалтыг арилгахгүй
    await buyLesson(m.agent, c.lessonIds[1]!);
    expect((await m.agent.get(`/communities/${teacherId}`).expect(403)).body.code).toBe('COMMUNITY_REMOVED');
    // Хичээлийн эрх хэвээр
    await m.agent.get(`/catalog/lessons/${c.lessonIds[0]}`).expect(200);
    expect((await m.agent.get('/communities').expect(200)).body).toEqual([]);

    expect((await tch.agent.get(`/communities/${teacherId}`).expect(200)).body.memberCount).toBe(1);
    const after = (await tch.agent.get('/teacher/community/members').expect(200)).body.items;
    expect(after.find((x: { id: string }) => x.id === m.user.id).removed).toEqual(expect.objectContaining({ reason: 'Спам' }));

    // Хасагдсан оролцогчид шинэ сэтгэгдлийн мэдэгдэл очихгүй
    await comment(tch.agent, p.id, 'Багшийн хариу').expect(201);
    expect(await t.prisma.notification.count({ where: { userId: m.user.id, type: 'COMMUNITY_THREAD_COMMENT' } })).toBe(0);
    expect(await t.prisma.notification.count({ where: { userId: m2.user.id, type: 'COMMUNITY_POST_COMMENT' } })).toBe(2);

    // Сэргээх
    await tch.agent.post(`/teacher/community/members/${m.user.id}/restore`).expect(204);
    expect((await tch.agent.post(`/teacher/community/members/${m.user.id}/restore`).expect(404)).body.code).toBe('MEMBER_NOT_FOUND');
    expect((await m.agent.get(`/communities/${teacherId}`).expect(200)).body.role).toBe('MEMBER');

    const audit = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'community.member.' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => [a.action, a.actorId, a.targetId])).toEqual([
      ['community.member.remove', tch.user.id, m.user.id],
      ['community.member.restore', tch.user.id, m.user.id],
    ]);
  });
});

describe('Community — live хуанли', () => {
  it('багшийн нийтлэгдсэн курсуудын удахгүй болох live (эхлэх цагаар), линкгүй; дууссан/шалгагдаагүй/өөр багшийнх үгүй', async () => {
    const tch = await teacher();
    const other = await teacher('other@example.mn');
    const c1 = await course(tch.user.id, [
      { title: 'Танилцуулга' },
      { type: 'LIVE', title: 'Маргаашийн live', content: live(24 * HOUR) },
      { type: 'LIVE', title: 'Дууссан', content: live(-3 * HOUR) },
      { type: 'LIVE', title: 'Шалгагдаагүй', content: live(2 * HOUR), reviewStatus: 'IN_REVIEW' },
      { type: 'LIVE', title: 'Явагдаж буй', content: live(-30 * 60_000, 60) },
    ]);
    const c2 = await course(tch.user.id, [{ type: 'LIVE', title: 'Ирэх долоо хоног', content: live(7 * 24 * HOUR) }]);
    await course(tch.user.id, [{ type: 'LIVE', title: 'Ноорог курс', content: live(HOUR) }], 'DRAFT');
    await course(other.user.id, [{ type: 'LIVE', title: 'Өөр багш', content: live(HOUR) }]);

    const m = await learner('member@example.mn');
    await buyLesson(m.agent, c1.lessonIds[1]!);

    const ov = (await m.agent.get(`/communities/${tch.user.id}`).expect(200)).body;
    expect(ov.upcomingLive.map((l: { title: string }) => l.title)).toEqual(['Явагдаж буй', 'Маргаашийн live', 'Ирэх долоо хоног']);
    expect(ov.upcomingLive.map((l: { canJoin: boolean }) => l.canJoin)).toEqual([false, true, false]);
    expect(ov.upcomingLive[1]).toEqual({
      lessonId: c1.lessonIds[1],
      courseId: c1.id,
      courseTitle: expect.any(String),
      title: 'Маргаашийн live',
      startsAt: expect.any(String),
      durationMinutes: 60,
      endsAt: expect.any(String),
      canJoin: true,
    });
    expect(JSON.stringify(ov)).not.toContain('meet.example.com');

    const asTeacher = (await tch.agent.get(`/communities/${tch.user.id}`).expect(200)).body;
    expect(asTeacher.upcomingLive.every((l: { canJoin: boolean }) => l.canJoin)).toBe(true);
    expect(asTeacher.upcomingLive.map((l: { courseId: string }) => l.courseId)).toContain(c2.id);
  });
});

// ---------------------------------------------------------------------------
// Ticket 26: засах, хуудаслалт, мэдэгдэл, имэйл тохиргоо, админ moderation
// ---------------------------------------------------------------------------

const randomId = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function feedItem(res: { body: { items: { id: string }[]; pinned: { id: string }[] } }, id: string): any {
  return [...res.body.pinned, ...res.body.items].find((x) => x.id === id);
}

describe('Community — нийтлэл/сэтгэгдэл засах', () => {
  it('зөвхөн зохиогч засна (багш/админ ч бусдынхыг засахгүй); "засварласан" тэмдэг; хоосон 400; өөрчлөлтгүй бол тэмдэглэхгүй', async () => {
    const { tch, m, teacherId } = await setup();
    const adm = await admin();
    const m2 = await learner('member2@example.mn');
    const c = await course(teacherId);
    await buyLesson(m2.agent, c.lessonIds[0]!);

    const p = (await post(m.agent, teacherId, { body: 'Анхны' }).expect(201)).body;
    expect(p.canEdit).toBe(true);
    expect(p.editedAt).toBeNull();

    const edited = (await m.agent.patch(`/community/posts/${p.id}`).send({ body: '  Засварласан  ' }).expect(200)).body;
    expect(edited.body).toBe('Засварласан');
    expect(edited.editedAt).toEqual(expect.any(String));
    expect(feedItem(await feed(m.agent, teacherId).expect(200), p.id).editedAt).toBe(edited.editedAt);

    // Өөрчлөлтгүй -> editedAt хэвээр
    const same = (await m.agent.patch(`/community/posts/${p.id}`).send({ body: 'Засварласан' }).expect(200)).body;
    expect(same.editedAt).toBe(edited.editedAt);

    // Бусад: гишүүн, багш, админ -> 403; гадны хэрэглэгч -> гишүүн биш; зочин 401
    for (const who of [m2, tch, adm]) await who.agent.patch(`/community/posts/${p.id}`).send({ body: 'x' }).expect(403);
    const outsider = await learner('outsider@example.mn');
    expect((await outsider.agent.patch(`/community/posts/${p.id}`).send({ body: 'x' }).expect(403)).body.code).toBe('COMMUNITY_MEMBERS_ONLY');
    await t.agent().patch(`/community/posts/${p.id}`).send({ body: 'x' }).expect(401);
    expect(feedItem(await feed(tch.agent, teacherId).expect(200), p.id).canEdit).toBe(false);

    // Хоосон / хэт урт / байхгүй
    expect((await m.agent.patch(`/community/posts/${p.id}`).send({ body: '   ' }).expect(400)).body.code).toBe('EMPTY_POST');
    await m.agent.patch(`/community/posts/${p.id}`).send({ body: 'a'.repeat(5001) }).expect(400);
    await m.agent.patch(`/community/posts/${randomId}`).send({ body: 'x' }).expect(404);

    // Сэтгэгдэл
    const cm = (await comment(m2.agent, p.id, 'Анхны сэтгэгдэл').expect(201)).body;
    expect(cm.canEdit).toBe(true);
    const ce = (await m2.agent.patch(`/community/comments/${cm.id}`).send({ body: 'Засав' }).expect(200)).body;
    expect(ce.body).toBe('Засав');
    expect(ce.editedAt).toEqual(expect.any(String));
    for (const who of [m, tch, adm]) await who.agent.patch(`/community/comments/${cm.id}`).send({ body: 'x' }).expect(403);
    expect((await m2.agent.patch(`/community/comments/${cm.id}`).send({ body: ' ' }).expect(400)).body.code).toBe('EMPTY_COMMENT');
    const listed = (await m.agent.get(`/community/posts/${p.id}/comments`).expect(200)).body.items[0];
    expect(listed).toEqual(expect.objectContaining({ body: 'Засав', editedAt: ce.editedAt, canEdit: false }));
    // Засвар мэдэгдэл үүсгэхгүй (зөвхөн шинэ сэтгэгдэл)
    expect(await t.prisma.notification.count({ where: { type: { startsWith: 'COMMUNITY_' } } })).toBe(1);

    // Модерац хэвээр: багш бусдын сэтгэгдлийг устгана
    await tch.agent.delete(`/community/comments/${cm.id}`).expect(204);
    await m2.agent.patch(`/community/comments/${cm.id}`).send({ body: 'x' }).expect(404);
  });

  it('хасагдсан гишүүн засаж чадахгүй (COMMUNITY_REMOVED)', async () => {
    const { tch, m, teacherId } = await setup();
    const p = (await post(m.agent, teacherId, { body: 'Анхны' }).expect(201)).body;
    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({}).expect(204);
    expect((await m.agent.patch(`/community/posts/${p.id}`).send({ body: 'Шинэ' }).expect(403)).body.code).toBe('COMMUNITY_REMOVED');
  });
});

describe('Community — гишүүдийн хуудаслалт, memberCount', () => {
  it('SQL-ээр хуудаслана (шинэ нь эхэнд), total хасагдсаныг оруулна, memberCount оруулахгүй; курс + lesson эзэмшигч давхардахгүй', async () => {
    const tch = await teacher();
    const teacherId = tch.user.id as string;
    const c = await course(teacherId, [{}, {}, {}]);
    const other = await teacher('other@example.mn');
    const oc = await course(other.user.id);

    const users: Awaited<ReturnType<typeof learner>>[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await learner(`m${i}@example.mn`);
      users.push(u);
      await buyLesson(u.agent, c.lessonIds[0]!);
      // Эрэмбэ тогтвортой байлгахын тулд эзэмшлийн огноог тодорхой болгоно
      await t.prisma.entitlement.updateMany({ where: { userId: u.user.id }, data: { createdAt: new Date(Date.now() - (10 - i) * HOUR) } });
    }
    // Нэг хэрэглэгч өөр lesson нэмж авбал давхардахгүй
    await buyLesson(users[0]!.agent, c.lessonIds[1]!);
    // Бүтэн курс авсан гишүүн (хамгийн шинэ)
    const full = await learner('full@example.mn', 500);
    await buyCourse(full.agent, (await course(teacherId, [{}, {}])).id, 10);
    // Өөр багшийн эзэмшигч гишүүн биш
    const foreign = await learner('foreign@example.mn');
    await buyLesson(foreign.agent, oc.lessonIds[0]!);

    expect((await tch.agent.get(`/communities/${teacherId}`).expect(200)).body.memberCount).toBe(6);

    const p1 = (await tch.agent.get('/teacher/community/members?limit=4').expect(200)).body;
    expect(p1).toEqual(expect.objectContaining({ total: 6, page: 1, pageSize: 4 }));
    expect(p1.items).toHaveLength(4);
    const p2 = (await tch.agent.get('/teacher/community/members?limit=4&page=2').expect(200)).body;
    expect(p2.items).toHaveLength(2);
    const ids = [...p1.items, ...p2.items].map((x: { id: string }) => x.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).not.toContain(foreign.user.id);
    expect(ids.slice(0, 3)).toEqual([full.user.id, users[4]!.user.id, users[3]!.user.id]);
    expect((await tch.agent.get('/teacher/community/members?page=9').expect(200)).body.items).toEqual([]);
    await tch.agent.get('/teacher/community/members?limit=101').expect(400);
    await tch.agent.get('/teacher/community/members?page=0').expect(400);

    // Хасалт: total хэвээр, memberCount буурна, жагсаалтад тэмдэглэгээтэй
    await tch.agent.post(`/teacher/community/members/${users[4]!.user.id}/remove`).send({ reason: 'Дүрэм' }).expect(204);
    expect((await tch.agent.get(`/communities/${teacherId}`).expect(200)).body.memberCount).toBe(5);
    const again = (await tch.agent.get('/teacher/community/members?limit=2').expect(200)).body;
    expect(again.total).toBe(6);
    expect(again.items[1]).toEqual(expect.objectContaining({ id: users[4]!.user.id, removed: expect.objectContaining({ reason: 'Дүрэм' }) }));
  });
});

describe('Community — гишүүнчлэлийн мэдэгдэл', () => {
  it('хасахад (шалтгаантай) ба сэргээхэд гишүүнд мэдэгдэл; давтан хасалт дахин мэдэгдэхгүй; багшид очихгүй', async () => {
    const { tch, m, teacherId } = await setup();
    await t.prisma.user.update({ where: { id: teacherId }, data: { name: 'Болд' } });

    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({ reason: 'Спам' }).expect(204);
    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({}).expect(204); // давтан
    let notes = await t.prisma.notification.findMany({ where: { type: { startsWith: 'COMMUNITY_MEMBER_' } } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(expect.objectContaining({ userId: m.user.id, type: 'COMMUNITY_MEMBER_REMOVED', link: `/communities/${teacherId}` }));

    let inbox = (await m.agent.get('/notifications').expect(200)).body.items;
    expect(inbox[0].title).toContain('Болд');
    expect(inbox[0].body).toContain('Шалтгаан: Спам.');
    expect(inbox[0].body).toContain('хичээлийн эрх хэвээр');

    await tch.agent.post(`/teacher/community/members/${m.user.id}/restore`).expect(204);
    notes = await t.prisma.notification.findMany({ where: { type: { startsWith: 'COMMUNITY_MEMBER_' } }, orderBy: { createdAt: 'asc' } });
    expect(notes.map((n) => n.type)).toEqual(['COMMUNITY_MEMBER_REMOVED', 'COMMUNITY_MEMBER_RESTORED']);
    inbox = (await m.agent.get('/notifications').expect(200)).body.items;
    expect(inbox[0].title).toContain('буцаж нэгдлээ');

    // Шалтгаангүй хасалт -> "Шалтгаан" хэсэггүй
    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({}).expect(204);
    inbox = (await m.agent.get('/notifications').expect(200)).body.items;
    expect(inbox[0].body).not.toContain('Шалтгаан');
    expect(await t.prisma.notification.count({ where: { userId: teacherId, type: { startsWith: 'COMMUNITY_' } } })).toBe(0);
  });
});

describe('Community — сэтгэгдлийн имэйл тохиргоо', () => {
  const prefs = (a: Agent) => a.get('/notifications/preferences');
  // Нэвтрэх OTP имэйлүүдийг оруулахгүй: зөвхөн notification имэйл (community-ийн сэтгэгдэл, гишүүнчлэл)
  const emailsTo = (to: string) => t.email.sent.filter((e) => e.to === to && /(сэтгэгдэл|community)/i.test(e.subject)).length;

  it('default идэвхтэй; унтраахад имэйл явахгүй (in-app хэвээр), асаахад дахин явна; хэрэглэгч тус бүр; буруу утга 400', async () => {
    const { m, teacherId } = await setup();
    const m2 = await learner('member2@example.mn');
    const c = await course(teacherId);
    await buyLesson(m2.agent, c.lessonIds[0]!);
    const p = (await post(m.agent, teacherId, { body: 'Асуулт' }).expect(201)).body;

    expect((await prefs(m.agent).expect(200)).body).toEqual([
      { category: 'COMMUNITY_COMMENT', emailEnabled: true },
      { category: 'TEACHER_SALES', emailEnabled: true },
    ]);
    await t.agent().get('/notifications/preferences').expect(401);

    // Идэвхтэй: имэйл явна
    await comment(m2.agent, p.id, 'Нэгдүгээр').expect(201);
    await t.queue.drain();
    expect(emailsTo('member@example.mn')).toBe(1);

    // Унтраах
    expect((await m.agent.put('/notifications/preferences/COMMUNITY_COMMENT').send({ emailEnabled: false }).expect(200)).body).toEqual({
      category: 'COMMUNITY_COMMENT',
      emailEnabled: false,
    });
    expect((await prefs(m.agent).expect(200)).body[0].emailEnabled).toBe(false);
    expect((await prefs(m2.agent).expect(200)).body[0].emailEnabled).toBe(true); // бусдад нөлөөлөхгүй

    await comment(m2.agent, p.id, 'Хоёрдугаар').expect(201);
    await t.queue.drain();
    expect(emailsTo('member@example.mn')).toBe(1); // нэмэгдээгүй
    const latest = await t.prisma.notification.findFirstOrThrow({ where: { userId: m.user.id }, orderBy: { createdAt: 'desc' } });
    expect(latest.emailStatus).toBe('NONE');
    const comments = (await m.agent.get('/notifications').expect(200)).body.items.filter((n: { type: string }) => n.type === 'COMMUNITY_POST_COMMENT');
    expect(comments).toHaveLength(2); // in-app хэвээр

    // Асаах
    await m.agent.put('/notifications/preferences/COMMUNITY_COMMENT').send({ emailEnabled: true }).expect(200);
    await comment(m2.agent, p.id, 'Гуравдугаар').expect(201);
    await t.queue.drain();
    expect(emailsTo('member@example.mn')).toBe(2);

    await m.agent.put('/notifications/preferences/NOPE').send({ emailEnabled: false }).expect(400);
    await m.agent.put('/notifications/preferences/COMMUNITY_COMMENT').send({ emailEnabled: 'no' }).expect(400);
  });

  it('сэтгэгдлийн имэйлийг унтраасан ч гишүүнчлэлийн мэдэгдэл (хасалт) имэйлээр явна', async () => {
    const { tch, m } = await setup();
    await m.agent.put('/notifications/preferences/COMMUNITY_COMMENT').send({ emailEnabled: false }).expect(200);
    await tch.agent.post(`/teacher/community/members/${m.user.id}/remove`).send({}).expect(204);
    await t.queue.drain();
    expect(emailsTo('member@example.mn')).toBe(1);
  });
});

describe('Community — админ moderation', () => {
  const list = (a: Agent, q = '') => a.get(`/admin/community/items${q}`);

  it('админ биш 403, зочин 401; жагсаалт (нийтлэл/сэтгэгдэл, статус, хуудаслалт)', async () => {
    const { tch, m, teacherId } = await setup();
    const adm = await admin();
    const p1 = (await post(m.agent, teacherId, { body: 'Нэг' }).expect(201)).body;
    const p2 = (await post(tch.agent, teacherId, { body: 'Хоёр' }).expect(201)).body;
    await comment(m.agent, p2.id, 'Сэтгэгдэл').expect(201);

    await t.agent().get('/admin/community/items').expect(401);
    for (const who of [m, tch]) {
      await list(who.agent).expect(403);
      await who.agent.post(`/admin/community/posts/${p1.id}/hide`).send({ reason: 'x' }).expect(403);
      await who.agent.post(`/admin/community/posts/${p1.id}/unhide`).expect(403);
      await who.agent.post(`/admin/community/posts/${p1.id}/delete`).send({ reason: 'x' }).expect(403);
    }

    const posts = (await list(adm.agent).expect(200)).body;
    expect(posts.items.map((x: { id: string }) => x.id)).toEqual([p2.id, p1.id]);
    expect(posts.items[1]).toEqual(
      expect.objectContaining({
        kind: 'post',
        body: 'Нэг',
        hasImage: false,
        hidden: null,
        teacher: expect.objectContaining({ id: teacherId }),
        author: expect.objectContaining({ id: m.user.id }),
      }),
    );
    const cms = (await list(adm.agent, '?kind=comment').expect(200)).body;
    expect(cms.items).toHaveLength(1);
    expect(cms.items[0]).toEqual(expect.objectContaining({ kind: 'comment', postId: p2.id, teacher: expect.objectContaining({ id: teacherId }) }));

    const page1 = (await list(adm.agent, '?limit=1').expect(200)).body;
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBe(p2.id);
    const page2 = (await list(adm.agent, `?limit=1&before=${page1.nextCursor}`).expect(200)).body;
    expect(page2.items.map((x: { id: string }) => x.id)).toEqual([p1.id]);
    expect(page2.nextCursor).toBeNull();
    await list(adm.agent, '?status=BAD').expect(400);
    await list(adm.agent, `?before=${randomId}`).expect(404);
  });

  it('нуух/сэргээх: шалтгаан заавал, audit, нуусан агуулга гишүүнд харагдахгүй (багшид харагдана), давхар нуух 409, нуугдсан зохиогч засахгүй', async () => {
    const { tch, m, teacherId } = await setup();
    const adm = await admin();
    const m2 = await learner('member2@example.mn');
    const c = await course(teacherId);
    await buyLesson(m2.agent, c.lessonIds[0]!);
    const p = (await post(m.agent, teacherId, { body: 'Зохисгүй' }).expect(201)).body;
    const cm = (await comment(m.agent, p.id, 'Зохисгүй сэтгэгдэл').expect(201)).body;

    await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({}).expect(400);
    await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({ reason: '  ' }).expect(400);
    await adm.agent.post(`/admin/community/posts/${randomId}/hide`).send({ reason: 'x' }).expect(404);

    const hidden = (await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({ reason: 'Доромжлол' }).expect(200)).body;
    expect(hidden.hidden).toEqual({ reason: 'Доромжлол', at: expect.any(String), by: { id: adm.user.id, name: null } });
    expect((await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({ reason: 'дахин' }).expect(409)).body.code).toBe('ALREADY_HIDDEN');
    await adm.agent.post(`/admin/community/comments/${cm.id}/hide`).send({ reason: 'Спам' }).expect(200);

    // Гишүүнд: агуулга хоосон, hidden тэмдэгтэй; багшид агуулга харагдана
    expect(feedItem(await feed(m2.agent, teacherId).expect(200), p.id)).toEqual(
      expect.objectContaining({ body: '', hidden: true, hiddenReason: 'Доромжлол', canEdit: false }),
    );
    expect(feedItem(await feed(tch.agent, teacherId).expect(200), p.id).body).toBe('Зохисгүй');
    const cmMember = (await m2.agent.get(`/community/posts/${p.id}/comments`).expect(200)).body.items[0];
    expect(cmMember).toEqual(expect.objectContaining({ body: '', hidden: true }));
    expect((await tch.agent.get(`/community/posts/${p.id}/comments`).expect(200)).body.items[0].body).toBe('Зохисгүй сэтгэгдэл');
    // Нуугдсан нийтлэл/сэтгэгдлийг зохиогч засахгүй
    await m.agent.patch(`/community/posts/${p.id}`).send({ body: 'Засав' }).expect(403);
    await m.agent.patch(`/community/comments/${cm.id}`).send({ body: 'Засав' }).expect(403);

    const hiddenOnly = (await list(adm.agent, '?status=HIDDEN').expect(200)).body;
    expect(hiddenOnly.items.map((x: { id: string }) => x.id)).toEqual([p.id]);
    expect((await list(adm.agent, '?status=VISIBLE').expect(200)).body.items).toEqual([]);

    // Сэргээх
    expect((await adm.agent.post(`/admin/community/posts/${p.id}/unhide`).expect(200)).body.hidden).toBeNull();
    expect((await adm.agent.post(`/admin/community/posts/${p.id}/unhide`).expect(409)).body.code).toBe('NOT_HIDDEN');
    expect(feedItem(await feed(m2.agent, teacherId).expect(200), p.id)).toEqual(expect.objectContaining({ body: 'Зохисгүй', hidden: false }));

    const audit = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'community.' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => [a.action, a.actorId, a.targetId])).toEqual([
      ['community.post.hide', adm.user.id, p.id],
      ['community.comment.hide', adm.user.id, cm.id],
      ['community.post.unhide', adm.user.id, p.id],
    ]);
    expect(audit[0]!.after).toEqual({ reason: 'Доромжлол' });
  });

  it('нуухад зохиогчид мэдэгдэл (in-app + имэйл, тохиргоогоор унтрахгүй); өөрийнхийг нуувал үгүй; сэргээхэд мэдэгдэхгүй', async () => {
    const { m, teacherId } = await setup();
    const adm = await admin();
    const p = (await post(m.agent, teacherId, { body: 'Зохисгүй' }).expect(201)).body;
    const cm = (await comment(m.agent, p.id, 'Зохисгүй сэтгэгдэл').expect(201)).body;
    const hiddenNotes = () => t.prisma.notification.findMany({ where: { type: 'COMMUNITY_CONTENT_HIDDEN' }, orderBy: { createdAt: 'asc' } });
    const mailsToMember = () => t.email.sent.filter((e) => e.to === 'member@example.mn' && /нуугдлаа/.test(e.subject)).length;

    // Имэйлийн ангиллыг унтраах боломжгүй: ангилалд ороогүй төрөл үргэлж явна
    for (const category of ['COMMUNITY_COMMENT', 'TEACHER_SALES']) {
      await m.agent.put(`/notifications/preferences/${category}`).send({ emailEnabled: false }).expect(200);
    }

    await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({ reason: 'Доромжлол' }).expect(200);
    await adm.agent.post(`/admin/community/comments/${cm.id}/hide`).send({ reason: 'Спам' }).expect(200);
    const notes = await hiddenNotes();
    expect(notes.map((n) => [n.userId, n.link])).toEqual([
      [m.user.id, `/communities/${teacherId}?post=${p.id}`],
      [m.user.id, `/communities/${teacherId}?post=${p.id}`],
    ]);
    expect(notes.every((n) => n.emailStatus !== 'NONE')).toBe(true);
    const inbox = (await m.agent.get('/notifications').expect(200)).body.items;
    expect(inbox.find((n: { body: string }) => n.body.includes('Шалтгаан: Доромжлол'))?.title).toContain('нийтлэл');
    expect(inbox.find((n: { body: string }) => n.body.includes('Шалтгаан: Спам'))?.title).toContain('сэтгэгдэл');
    await t.queue.drain();
    expect(mailsToMember()).toBe(2);

    // Давхар нуух (409) шинэ мэдэгдэл үүсгэхгүй; сэргээх мэдэгдэхгүй
    await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({ reason: 'дахин' }).expect(409);
    await adm.agent.post(`/admin/community/posts/${p.id}/unhide`).expect(200);
    expect(await hiddenNotes()).toHaveLength(2);

    // Модератор өөрийнхийг нуувал мэдэгдэхгүй
    const own = (await post(adm.agent, teacherId, { body: 'Админы нийтлэл' }).expect(201)).body;
    await adm.agent.post(`/admin/community/posts/${own.id}/hide`).send({ reason: 'өөрөө' }).expect(200);
    expect(await hiddenNotes()).toHaveLength(2);
    expect(await t.prisma.notification.count({ where: { userId: adm.user.id, type: 'COMMUNITY_CONTENT_HIDDEN' } })).toBe(0);
  });

  it('нуусан нийтлэлд шинэ сэтгэгдэл 409 POST_HIDDEN, одоо байгаа сэтгэгдлийг засах 409; сэргээсний дараа дахин боломжтой', async () => {
    const { tch, m, teacherId } = await setup();
    const adm = await admin();
    const p = (await post(m.agent, teacherId, { body: 'Нийтлэл' }).expect(201)).body;
    const cm = (await comment(m.agent, p.id, 'Анхны').expect(201)).body;

    await adm.agent.post(`/admin/community/posts/${p.id}/hide`).send({ reason: 'Спам' }).expect(200);
    for (const who of [m, tch, adm]) {
      const res = await comment(who.agent, p.id, 'Шинэ').expect(409);
      expect(res.body.code).toBe('POST_HIDDEN');
      expect(res.body.message).toContain('Нуусан нийтлэлд');
    }
    expect((await m.agent.patch(`/community/comments/${cm.id}`).send({ body: 'Засав' }).expect(409)).body.code).toBe('POST_HIDDEN');
    expect(await t.prisma.communityComment.count({ where: { postId: p.id } })).toBe(1);
    expect((await t.prisma.communityComment.findUniqueOrThrow({ where: { id: cm.id } })).body).toBe('Анхны');

    await adm.agent.post(`/admin/community/posts/${p.id}/unhide`).expect(200);
    await comment(m.agent, p.id, 'Шинэ').expect(201);
    await m.agent.patch(`/community/comments/${cm.id}`).send({ body: 'Засав' }).expect(200);
  });

  it('устгах: шалтгаан заавал, зураг storage-оос устна, audit-д агуулга + шалтгаан', async () => {
    const { m, teacherId } = await setup();
    const adm = await admin();
    const key = await uploadImage(m.agent, teacherId);
    const p = (await post(m.agent, teacherId, { body: 'Устгах', imageKey: key }).expect(201)).body;
    const cm = (await comment(m.agent, p.id, 'Сэтгэгдэл').expect(201)).body;

    await adm.agent.post(`/admin/community/comments/${cm.id}/delete`).send({}).expect(400);
    await adm.agent.post(`/admin/community/comments/${cm.id}/delete`).send({ reason: 'Спам' }).expect(204);
    expect(await t.prisma.communityComment.count()).toBe(0);
    await adm.agent.post(`/admin/community/comments/${cm.id}/delete`).send({ reason: 'Спам' }).expect(404);

    await adm.agent.post(`/admin/community/posts/${p.id}/delete`).send({ reason: 'Хууль бус' }).expect(204);
    expect(await t.prisma.communityPost.count()).toBe(0);
    expect(await t.storage.info('private', key)).toBeFalsy();

    const audit = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'community.' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => [a.action, a.actorId, a.targetId])).toEqual([
      ['community.comment.delete', adm.user.id, cm.id],
      ['community.post.delete', adm.user.id, p.id],
    ]);
    expect(audit[1]!.after).toEqual({ reason: 'Хууль бус', by: 'admin-moderation' });
    expect(audit[1]!.before).toEqual(expect.objectContaining({ body: 'Устгах', authorId: m.user.id }));
  });
});
