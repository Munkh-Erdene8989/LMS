import type { LessonReviewStatus } from '@lms/db';
import { formatUbDateTime, isoToUbLocal } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { LIVE_REMINDER_JOB, LiveLessonsService } from '../src/catalog/live-lessons.service';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
jest.setTimeout(180_000);

let t: TestApp;
let credits: CreditsService;

beforeAll(async () => {
  t = await createTestApp();
  credits = t.app.get(CreditsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const HOUR = 60 * 60_000;
const MEET = 'https://meet.google.com/abc-defg-hij';
const ZOOM = 'https://us02web.zoom.us/j/123456789?pwd=secret';

// ---------------------------------------------------------------------------
// Fixture-ууд: курс DB-д шууд (зохиох/шалгах урсгал catalog.spec.ts-д). Live-ийн хуваарь, эрх,
// сануулга бүгд HTTP + дарааллаар.
// ---------------------------------------------------------------------------

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

async function learner(email: string, balance = 0) {
  const s = await loginByEmail(t, email);
  if (balance > 0) {
    await t.prisma.$transaction(
      (tx) => credits.grant(tx, { userId: s.user.id, credits: balance, source: 'ADMIN_ADJUST' }),
      CREDIT_TX_OPTIONS,
    );
  }
  return s;
}

interface LiveSpec {
  startsAt?: Date | null;
  durationMinutes?: number;
  meetingUrl?: string;
  preview?: boolean;
  status?: LessonReviewStatus;
}

/** Нийтлэгдсэн курс: [0] = live lesson, [1] = текст lesson. */
async function liveCourse(teacherId: string, live: LiveSpec = {}) {
  const startsAt = live.startsAt === undefined ? new Date(Date.now() + 3 * 24 * HOUR) : live.startsAt;
  const course = await t.prisma.course.create({
    data: {
      teacherId,
      title: 'Англи хэл',
      priceCredits: 8,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1-р бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const sectionId = course.sections[0]!.id;
  const liveLesson = await t.prisma.lesson.create({
    data: {
      courseId: course.id,
      sectionId,
      title: 'Ярианы цаг',
      type: 'LIVE',
      position: 0,
      priceCredits: 5,
      isFreePreview: live.preview ?? false,
      reviewStatus: live.status ?? 'APPROVED',
      content: {
        startsAt: startsAt?.toISOString() ?? null,
        durationMinutes: live.durationMinutes ?? 60,
        meetingUrl: live.meetingUrl ?? ZOOM,
      },
    },
  });
  const text = await t.prisma.lesson.create({
    data: {
      courseId: course.id,
      sectionId,
      title: 'Дүрэм',
      type: 'TEXT',
      position: 1,
      priceCredits: 5,
      reviewStatus: 'APPROVED',
      content: { markdown: 'Дүрэм' },
    },
  });
  return { id: course.id, sectionId, liveId: liveLesson.id, textId: text.id };
}

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];
const confirm = (expectedCredits: number) => ({ confirmNoRefund: true, expectedCredits });
const setLive = (a: Agent, lessonId: string, content: Record<string, unknown>) =>
  a.patch(`/teacher/lessons/${lessonId}`).send({ content });

const reminderJobs = () => t.queue.byName(LIVE_REMINDER_JOB);
const notificationsOf = (type: string) =>
  t.prisma.notification.findMany({ where: { type }, orderBy: { userId: 'asc' } });

// ---------------------------------------------------------------------------

describe('Live хичээл зохиох', () => {
  it('багш live хичээл үүсгэж, Улаанбаатарын цагаар хуваарь, линк оруулна; буруу утгыг татгалзана', async () => {
    const tch = await teacher();
    const c = (await tch.agent.post('/teacher/courses').send({ title: 'Live курс' }).expect(201)).body;
    const s = (await tch.agent.post(`/teacher/courses/${c.id}/sections`).send({ title: 'Бүлэг' }).expect(201)).body;
    const d = (
      await tch.agent.post(`/teacher/sections/${s.sections[0].id}/lessons`).send({ title: 'Шууд', type: 'LIVE' }).expect(201)
    ).body;
    const lesson = d.sections[0].lessons[0];
    expect(lesson.content).toEqual({ type: 'LIVE', startsAt: null, durationMinutes: null, endsAt: null, meetingUrl: null });
    expect(lesson.problems).toEqual(['Эхлэх цаг оруулаагүй', 'Үргэлжлэх хугацаа оруулаагүй', 'Zoom/Meet линк оруулаагүй']);

    // Офсетгүй цаг = Улаанбаатар (UTC+8): 19:00 UB = 11:00 UTC.
    const year = new Date().getUTCFullYear() + 1;
    const res = await setLive(tch.agent, lesson.id, { startsAt: `${year}-03-10T19:00`, durationMinutes: 90, meetingUrl: MEET }).expect(200);
    expect(res.body.sections[0].lessons[0]).toMatchObject({
      problems: [],
      content: {
        type: 'LIVE',
        startsAt: `${year}-03-10T11:00:00.000Z`,
        durationMinutes: 90,
        endsAt: `${year}-03-10T12:30:00.000Z`,
        meetingUrl: MEET,
      },
    });
    // Офсеттэй ISO ч хүлээн авна.
    const iso = await setLive(tch.agent, lesson.id, { startsAt: `${year}-03-11T20:30:00+08:00`, durationMinutes: 60, meetingUrl: MEET }).expect(200);
    expect(iso.body.sections[0].lessons[0].content.startsAt).toBe(`${year}-03-11T12:30:00.000Z`);

    const past = await setLive(tch.agent, lesson.id, { startsAt: '2020-01-01T10:00', durationMinutes: 60, meetingUrl: MEET }).expect(400);
    expect(past.body.code).toBe('LIVE_START_IN_PAST');
    const http = await setLive(tch.agent, lesson.id, { startsAt: `${year}-03-10T19:00`, durationMinutes: 60, meetingUrl: 'http://zoom.us/j/1' }).expect(400);
    expect(http.body.code).toBe('INVALID_LIVE');
    const short = await setLive(tch.agent, lesson.id, { startsAt: `${year}-03-10T19:00`, durationMinutes: 5, meetingUrl: MEET }).expect(400);
    expect(short.body.code).toBe('INVALID_LIVE');
    const bad = await setLive(tch.agent, lesson.id, { startsAt: `${year}-02-30T19:00`, durationMinutes: 60, meetingUrl: MEET }).expect(400);
    expect(bad.body.code).toBe('INVALID_LIVE');
  });
});

describe('Live линкийн эрх', () => {
  it('линк зөвхөн эзэмшигч (lesson / бүтэн курс), багш, админд; зочин, эрхгүй хэрэглэгчид гарахгүй', async () => {
    const tch = await teacher();
    const c = await liveCourse(tch.user.id, { meetingUrl: ZOOM });

    // Зочин: 403, линк алга. Курсийн хуудсанд хуваарь харагдана, линк үгүй.
    const guest = await t.http().get(`/catalog/lessons/${c.liveId}`).expect(403);
    expect(JSON.stringify(guest.body)).not.toContain('zoom.us');
    const detail = (await t.http().get(`/catalog/courses/${c.id}`).expect(200)).body;
    expect(JSON.stringify(detail)).not.toContain('zoom.us');
    const item = detail.sections[0].lessons.find((l: { id: string }) => l.id === c.liveId);
    expect(item).toMatchObject({ type: 'LIVE', live: { startsAt: expect.any(String), durationMinutes: 60 } });

    // Нэвтэрсэн, эрхгүй (өөр lesson эзэмшдэг ч): 403.
    const other = await learner('other@example.mn', 10);
    await other.agent.post(`/purchases/lessons/${c.textId}`).send(confirm(5)).expect(201);
    const denied = await other.agent.get(`/catalog/lessons/${c.liveId}`).expect(403);
    expect(JSON.stringify(denied.body)).not.toContain('zoom.us');

    // Lesson эзэмшигч.
    const buyer = await learner('buyer@example.mn', 10);
    await buyer.agent.post(`/purchases/lessons/${c.liveId}`).send(confirm(5)).expect(201);
    const owned = (await buyer.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body;
    expect(owned.access).toBe('OWNED');
    expect(owned.content).toMatchObject({ type: 'LIVE', meetingUrl: ZOOM, durationMinutes: 60 });

    // Бүтэн курс эзэмшигч.
    const whole = await learner('whole@example.mn', 10);
    await whole.agent.post(`/purchases/courses/${c.id}`).send(confirm(8)).expect(201);
    expect((await whole.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body.content.meetingUrl).toBe(ZOOM);

    // Багш, админ.
    const asTeacher = (await tch.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body;
    expect(asTeacher).toMatchObject({ access: 'TEACHER', content: { meetingUrl: ZOOM } });
    const adm = await admin();
    expect((await adm.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body).toMatchObject({
      access: 'ADMIN',
      content: { meetingUrl: ZOOM },
    });
  });

  it('free preview live: хуваарь харагдана, линк зөвхөн худалдан авсны дараа', async () => {
    const tch = await teacher();
    const c = await liveCourse(tch.user.id, { preview: true });
    const guest = (await t.http().get(`/catalog/lessons/${c.liveId}`).expect(200)).body;
    expect(guest.access).toBe('PREVIEW');
    expect(guest.content).toMatchObject({ type: 'LIVE', startsAt: expect.any(String), durationMinutes: 60, meetingUrl: null });
    expect(JSON.stringify(guest)).not.toContain('zoom.us');

    const u = await learner('buyer@example.mn', 10);
    expect((await u.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body.content.meetingUrl).toBeNull();
    await u.agent.post(`/purchases/lessons/${c.liveId}`).send(confirm(5)).expect(201);
    expect((await u.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body.content.meetingUrl).toBe(ZOOM);
  });
});

describe('Live сануулга', () => {
  it('24 цаг, 15 минутын өмнө товлогдож, эзэмшигчид + багшид нэг л удаа очно (эрхгүйд үгүй)', async () => {
    const tch = await teacher();
    const c = await liveCourse(tch.user.id, { startsAt: null });
    const buyer = await learner('buyer@example.mn', 10);
    await buyer.agent.post(`/purchases/lessons/${c.liveId}`).send(confirm(5)).expect(201);
    const other = await learner('other@example.mn', 10);
    await other.agent.post(`/purchases/lessons/${c.textId}`).send(confirm(5)).expect(201);

    // Нийтлэгдсэн live-д ч багш хуваарь тогтооно → 2 сануулга товлогдоно.
    const startsAt = new Date(Date.now() + 3 * 24 * HOUR);
    startsAt.setUTCSeconds(0, 0);
    const before = Date.now();
    await setLive(tch.agent, c.liveId, { startsAt: isoToUbLocal(startsAt.toISOString()), durationMinutes: 45, meetingUrl: MEET }).expect(200);
    const jobs = reminderJobs();
    expect(jobs.map((j) => j.data)).toEqual([
      { lessonId: c.liveId, kind: 'H24', startsAt: startsAt.toISOString() },
      { lessonId: c.liveId, kind: 'M15', startsAt: startsAt.toISOString() },
    ]);
    const near = (target: number, runAt: number) => {
      expect(runAt).toBeGreaterThanOrEqual(target - (Date.now() - before) - 1000);
      expect(runAt).toBeLessThanOrEqual(target + 1000);
    };
    near(startsAt.getTime() - 24 * HOUR, jobs[0]!.runAt);
    near(startsAt.getTime() - 15 * 60_000, jobs[1]!.runAt);
    // Анх тогтоосон цаг тул "цаг өөрчлөгдлөө" мэдэгдэл үгүй.
    expect(await notificationsOf('LIVE_RESCHEDULED')).toHaveLength(0);

    await t.queue.drain();
    const h24 = await notificationsOf('LIVE_REMINDER_H24');
    const m15 = await notificationsOf('LIVE_REMINDER_M15');
    const expected = [buyer.user.id, tch.user.id].sort();
    expect(h24.map((n) => n.userId)).toEqual(expected);
    expect(m15.map((n) => n.userId)).toEqual(expected);
    expect(h24[0]).toMatchObject({
      link: `/courses/${c.id}/lessons/${c.liveId}`,
      params: { title: 'Ярианы цаг', course: 'Англи хэл', startsAt: formatUbDateTime(startsAt.toISOString()), duration: 45 },
    });
    // Имэйл (баталгаажсан имэйлтэй хүмүүст); линк имэйлд биш — хичээлийн хуудсанд.
    const mail = t.email.last('buyer@example.mn');
    expect(mail?.subject).toContain('15 минутын дараа');
    expect(mail?.text).not.toContain('meet.google.com');

    // Ажил давтагдсан ч (BullMQ retry, давхар worker) дахин илгээхгүй.
    const live = t.app.get(LiveLessonsService);
    await live.sendReminder({ lessonId: c.liveId, kind: 'H24', startsAt: startsAt.toISOString() });
    expect(await notificationsOf('LIVE_REMINDER_H24')).toHaveLength(2);
    expect(await t.prisma.liveReminder.count()).toBe(2);
  });

  it('цаг өөрчлөгдөхөд шинэ цагаар дахин товлогдоно; хуучин ажил юу ч илгээхгүй; эзэмшигчид мэдэгдэнэ', async () => {
    const tch = await teacher();
    const first = new Date(Date.now() + 2 * 24 * HOUR);
    first.setUTCSeconds(0, 0);
    const c = await liveCourse(tch.user.id, { startsAt: null });
    const buyer = await learner('buyer@example.mn', 10);
    await buyer.agent.post(`/purchases/courses/${c.id}`).send(confirm(8)).expect(201);

    await setLive(tch.agent, c.liveId, { startsAt: first.toISOString(), durationMinutes: 60, meetingUrl: ZOOM }).expect(200);
    // Ижил цагаар дахин хадгалахад (линк солих) давхар товлохгүй, мэдэгдэхгүй.
    await setLive(tch.agent, c.liveId, { startsAt: first.toISOString(), durationMinutes: 60, meetingUrl: MEET }).expect(200);
    expect(reminderJobs()).toHaveLength(2);
    expect(await notificationsOf('LIVE_RESCHEDULED')).toHaveLength(0);

    const second = new Date(first.getTime() + 26 * HOUR);
    await setLive(tch.agent, c.liveId, { startsAt: second.toISOString(), durationMinutes: 90, meetingUrl: MEET }).expect(200);
    expect(reminderJobs().map((j) => [j.data, j.status])).toEqual([
      [{ lessonId: c.liveId, kind: 'H24', startsAt: first.toISOString() }, 'waiting'],
      [{ lessonId: c.liveId, kind: 'M15', startsAt: first.toISOString() }, 'waiting'],
      [{ lessonId: c.liveId, kind: 'H24', startsAt: second.toISOString() }, 'waiting'],
      [{ lessonId: c.liveId, kind: 'M15', startsAt: second.toISOString() }, 'waiting'],
    ]);
    const rescheduled = await notificationsOf('LIVE_RESCHEDULED');
    expect(rescheduled.map((n) => n.userId)).toEqual([buyer.user.id]); // эзэмшигчид л (багш өөрөө өөрчилсөн)
    expect(rescheduled[0]!.params).toMatchObject({ startsAt: formatUbDateTime(second.toISOString()), duration: 90 });

    await t.queue.drain();
    for (const type of ['LIVE_REMINDER_H24', 'LIVE_REMINDER_M15']) {
      const rows = await notificationsOf(type);
      expect(rows).toHaveLength(2); // эзэмшигч + багш, зөвхөн шинэ цагаар
      for (const n of rows) expect(n.params).toMatchObject({ startsAt: formatUbDateTime(second.toISOString()) });
    }
    const sent = await t.prisma.liveReminder.findMany();
    expect(sent.map((r) => r.startsAt.toISOString())).toEqual([second.toISOString(), second.toISOString()]);
  });

  it('өнгөрсөн сануулгыг товлохгүй (2 цагийн дараах live-д зөвхөн 15 минутынх)', async () => {
    const tch = await teacher();
    const c = await liveCourse(tch.user.id, { startsAt: null });
    const startsAt = new Date(Date.now() + 2 * HOUR);
    await setLive(tch.agent, c.liveId, { startsAt: startsAt.toISOString(), durationMinutes: 60, meetingUrl: MEET }).expect(200);
    expect(reminderJobs().map((j) => (j.data as { kind: string }).kind)).toEqual(['M15']);
  });

  it('шалгагдаагүй, архивласан live-д сануулга очихгүй', async () => {
    const tch = await teacher();
    const buyer = await learner('buyer@example.mn', 10);
    const draft = await liveCourse(tch.user.id, { startsAt: null, status: 'DRAFT' });
    const archived = await liveCourse(tch.user.id, { startsAt: null });
    await buyer.agent.post(`/purchases/lessons/${archived.liveId}`).send(confirm(5)).expect(201);

    const startsAt = new Date(Date.now() + 3 * 24 * HOUR).toISOString();
    for (const c of [draft, archived]) {
      await setLive(tch.agent, c.liveId, { startsAt, durationMinutes: 60, meetingUrl: MEET }).expect(200);
    }
    expect(reminderJobs()).toHaveLength(4);
    await tch.agent.delete(`/teacher/lessons/${archived.liveId}`).expect(200); // APPROVED → архив
    await t.queue.drain();
    expect(await t.prisma.notification.count({ where: { type: { startsWith: 'LIVE_' } } })).toBe(0);
    expect(await t.prisma.liveReminder.count()).toBe(0);
  });
});

describe('Дууссан live → бичлэг', () => {
  it('дуусаагүй үед 409; дууссаны дараа VIDEO болж, эзэмшигчийн эрх хэвээр, хүлээгдэж буй сануулга очихгүй', async () => {
    const tch = await teacher();
    const c = await liveCourse(tch.user.id, { startsAt: null });
    const buyer = await learner('buyer@example.mn', 10);
    await buyer.agent.post(`/purchases/lessons/${c.liveId}`).send(confirm(5)).expect(201);

    const startsAt = new Date(Date.now() + 3 * 24 * HOUR).toISOString();
    await setLive(tch.agent, c.liveId, { startsAt, durationMinutes: 60, meetingUrl: MEET }).expect(200);
    expect((await tch.agent.post(`/teacher/lessons/${c.liveId}/convert-to-video`).expect(409)).body.code).toBe('LIVE_NOT_ENDED');
    expect((await tch.agent.post(`/teacher/lessons/${c.textId}/convert-to-video`).expect(409)).body.code).toBe('NOT_LIVE');

    // Явагдаж байгаа (эхэлсэн, дуусаагүй) → мөн 409.
    const ended = new Date(Date.now() - 2 * HOUR).toISOString();
    await t.prisma.lesson.update({
      where: { id: c.liveId },
      data: { content: { startsAt: new Date(Date.now() - 30 * 60_000).toISOString(), durationMinutes: 60, meetingUrl: MEET } },
    });
    await tch.agent.post(`/teacher/lessons/${c.liveId}/convert-to-video`).expect(409);

    await t.prisma.lesson.update({
      where: { id: c.liveId },
      data: { content: { startsAt: ended, durationMinutes: 60, meetingUrl: MEET } },
    });
    // Бусдын хичээл 404.
    const stranger = await teacher('stranger@example.mn');
    await stranger.agent.post(`/teacher/lessons/${c.liveId}/convert-to-video`).expect(404);

    const d = (await tch.agent.post(`/teacher/lessons/${c.liveId}/convert-to-video`).expect(200)).body;
    const lesson = d.sections[0].lessons.find((l: { id: string }) => l.id === c.liveId);
    expect(lesson).toMatchObject({ type: 'VIDEO', reviewStatus: 'APPROVED', content: { type: 'VIDEO' } });
    const row = await t.prisma.lesson.findUniqueOrThrow({ where: { id: c.liveId } });
    expect(row.content).toEqual({
      videoId: null,
      status: null,
      durationSeconds: null,
      error: null,
      fromLive: { startsAt: ended, durationMinutes: 60 },
    });

    const owned = (await buyer.agent.get(`/catalog/lessons/${c.liveId}`).expect(200)).body;
    expect(owned).toMatchObject({ access: 'OWNED', lesson: { type: 'VIDEO', live: null }, content: { type: 'VIDEO' } });
    expect(JSON.stringify(owned)).not.toContain('meet.google.com');

    await t.queue.drain(); // эхэнд товлосон сануулгууд
    expect(await t.prisma.notification.count({ where: { type: { startsWith: 'LIVE_REMINDER' } } })).toBe(0);
    await tch.agent.post(`/teacher/lessons/${c.liveId}/convert-to-video`).expect(409);
  });
});
