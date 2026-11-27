import type { LessonType } from '@lms/db';
import type { OrgReport, OrgReportRow } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { ensureHouseTeacher } from '../src/organizations/house-teacher';
import { createTestApp, loginByEmail, type TestApp } from './harness';

jest.setTimeout(180_000);

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

const DAY = 24 * 60 * 60_000;
let seq = 0;

async function admin(): Promise<{ agent: Agent; id: string }> {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return { agent: s.agent, id: s.user.id };
}

/** Курс: өгөгдсөн төрлийн APPROVED lesson-ууд (+ нэг архивласан TEXT — тооцогдохгүй). */
async function course(types: LessonType[], title = `Курс ${++seq}`) {
  const house = await ensureHouseTeacher(t.prisma, { identifier: 'house@example.mn' });
  const row = await t.prisma.course.create({
    data: {
      teacherId: house.userId,
      title,
      visibility: 'PRIVATE',
      priceCredits: 0,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: 'Бүлэг', position: 0 } },
    },
    include: { sections: true },
  });
  const ids: string[] = [];
  for (const [i, type] of types.entries()) {
    const l = await t.prisma.lesson.create({
      data: { courseId: row.id, sectionId: row.sections[0]!.id, title: `Хичээл ${i}`, type, position: i, priceCredits: 0, reviewStatus: 'APPROVED', content: {} },
    });
    ids.push(l.id);
  }
  await t.prisma.lesson.create({
    data: { courseId: row.id, sectionId: row.sections[0]!.id, title: 'Архивласан', type: 'TEXT', position: 99, priceCredits: 0, reviewStatus: 'APPROVED', content: {}, archivedAt: new Date() },
  });
  return { id: row.id, title, lessons: ids };
}

async function org(courseIds: string[], name = `Компани ${++seq}`) {
  return t.prisma.organization.create({
    data: { name, active: true, contractEndsAt: new Date(Date.now() + 30 * DAY), seatLimit: 20, courseGrants: { create: courseIds.map((courseId) => ({ courseId })) } },
  });
}

async function person(email: string, name: string | null) {
  const s = await loginByEmail(t, email);
  if (name) await t.prisma.user.update({ where: { id: s.user.id }, data: { name } });
  return s.user.id;
}

const join = (organizationId: string, userId: string, removed = false) =>
  t.prisma.organizationMember.create({ data: { organizationId, userId, removedAt: removed ? new Date() : null } });

const done = (userId: string, courseId: string, lessonId: string, extra: { score?: number; at?: Date } = {}) =>
  t.prisma.lessonProgress.create({
    data: { userId, courseId, lessonId, completedAt: new Date(), bestScorePercent: extra.score ?? null, lastViewedAt: extra.at ?? new Date() },
  });

const getReport = async (a: Agent, orgId: string, qs = '') => (await a.get(`/admin/organizations/${orgId}/report${qs}`).expect(200)).body as OrgReport;

const csv = async (a: Agent, orgId: string, qs = '') => {
  const res = await a
    .get(`/admin/organizations/${orgId}/report.csv${qs}`)
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return { res, buf: res.body as Buffer, text: (res.body as Buffer).toString('utf8') };
};

describe('Байгууллагын явцын тайлан (story 90)', () => {
  it('ADMIN-аас бусад 401/403', async () => {
    const c = await course(['TEXT']);
    const o = await org([c.id]);
    await t.http().get(`/admin/organizations/${o.id}/report`).expect(401);
    await t.http().get(`/admin/organizations/${o.id}/report.csv`).expect(401);
    const { agent } = await loginByEmail(t, 'plain@example.mn');
    await agent.get(`/admin/organizations/${o.id}/report`).expect(403);
    await agent.get(`/admin/organizations/${o.id}/report.csv`).expect(403);
  });

  it('явц %, quiz-ийн дундаж, сертификат, сүүлд идэвхтэй; архивласан lesson тооцогдохгүй', async () => {
    const a = await admin();
    const c1 = await course(['TEXT', 'QUIZ', 'QUIZ', 'VIDEO']);
    const c2 = await course(['TEXT', 'TEXT', 'TEXT'], 'Quiz-гүй курс');
    const o = await org([c1.id, c2.id]);
    const u = await person('a@example.mn', 'Бат');
    await join(o.id, u);
    const seen = new Date('2026-05-01T10:00:00Z');
    await done(u, c1.id, c1.lessons[0]!, { at: new Date('2026-04-01T00:00:00Z') });
    await done(u, c1.id, c1.lessons[1]!, { score: 80, at: seen });
    await done(u, c1.id, c1.lessons[2]!, { score: 75 }); // (80 + 75) / 2 = 77.5 → 77
    await done(u, c2.id, c2.lessons[0]!);
    await t.prisma.certificate.create({
      data: { code: 'ABCDEFGH23456789', userId: u, courseId: c1.id, recipientName: 'Бат', courseTitle: c1.title, teacherName: 'T', quizAveragePercent: 77, lessonCount: 4, issuedAt: new Date('2026-05-02T00:00:00Z') },
    });

    const { rows } = await getReport(a.agent, o.id);
    expect(rows).toHaveLength(2);
    const r1 = rows.find((r) => r.courseId === c1.id) as OrgReportRow;
    expect(r1).toMatchObject({
      name: 'Бат',
      email: 'a@example.mn',
      completedLessonCount: 3,
      lessonCount: 4,
      progressPercent: 75,
      quizAveragePercent: 77,
      certificateCode: 'ABCDEFGH23456789',
      certificateIssuedAt: '2026-05-02T00:00:00.000Z',
    });
    expect(r1.lastActivityAt).not.toBeNull();
    expect(new Date(r1.lastActivityAt!).getTime()).toBeGreaterThan(seen.getTime());
    const r2 = rows.find((r) => r.courseId === c2.id) as OrgReportRow;
    expect(r2).toMatchObject({ progressPercent: 33, lessonCount: 3, quizAveragePercent: null, certificateCode: null, certificateIssuedAt: null });

    // courseId шүүлтүүр
    const only = await getReport(a.agent, o.id, `?courseId=${c2.id}`);
    expect(only.rows.map((r) => r.courseId)).toEqual([c2.id]);
  });

  it('явцгүй гишүүн 0%, оноогүй quiz 0 гэж тооцогдоно, сүүлд идэвхтэй null', async () => {
    const a = await admin();
    const c = await course(['TEXT', 'QUIZ']);
    const o = await org([c.id]);
    await join(o.id, await person('b@example.mn', null));
    const { rows } = await getReport(a.agent, o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: null, progressPercent: 0, quizAveragePercent: 0, lastActivityAt: null });
  });

  it('өөр байгууллагын гишүүн, курс орохгүй', async () => {
    const a = await admin();
    const c1 = await course(['TEXT']);
    const c2 = await course(['TEXT']);
    const mine = await org([c1.id]);
    const other = await org([c1.id, c2.id]);
    const u1 = await person('in@example.mn', 'Манай');
    const u2 = await person('out@example.mn', 'Бусад');
    await join(mine.id, u1);
    await join(other.id, u2);
    await done(u2, c1.id, c1.lessons[0]!);

    const { rows } = await getReport(a.agent, mine.id);
    expect(rows.map((r) => [r.userId, r.courseId])).toEqual([[u1, c1.id]]);
    // Өөр байгууллагын курсээр шүүхэд хоосон
    expect((await getReport(a.agent, mine.id, `?courseId=${c2.id}`)).rows).toEqual([]);
    expect((await csv(a.agent, mine.id)).text).not.toContain('Бусад');
  });

  it('хасагдсан гишүүн анхдагчаар нуугдана, includeRemoved-тэй харагдана', async () => {
    const a = await admin();
    const c = await course(['TEXT']);
    const o = await org([c.id]);
    const u1 = await person('act@example.mn', 'Идэвхтэй');
    const u2 = await person('gone@example.mn', 'Хасагдсан');
    await join(o.id, u1);
    await join(o.id, u2, true);
    await done(u2, c.id, c.lessons[0]!);

    expect((await getReport(a.agent, o.id)).rows.map((r) => r.name)).toEqual(['Идэвхтэй']);
    expect((await getReport(a.agent, o.id, '?includeRemoved=false')).rows).toHaveLength(1);
    const all = await getReport(a.agent, o.id, '?includeRemoved=true');
    expect(all.rows.map((r) => [r.name, r.removed, r.progressPercent])).toEqual([
      ['Идэвхтэй', false, 0],
      ['Хасагдсан', true, 100],
    ]);
    await a.agent.get(`/admin/organizations/${o.id}/report?includeRemoved=maybe`).expect(400);
    await a.agent.get(`/admin/organizations/${o.id}/report?courseId=nope`).expect(400);
    await a.agent.get('/admin/organizations/00000000-0000-4000-8000-000000000999/report').expect(404);
  });

  it('CSV: BOM, Mongolian толгой, escaping, formula injection, audit', async () => {
    const a = await admin();
    const c = await course(['TEXT', 'QUIZ'], 'Курс, "хашилттай"');
    const o = await org([c.id], 'Монгол Ложистик');
    const u = await person('csv@example.mn', '=HYPERLINK("http://evil")');
    await join(o.id, u);
    const u2 = await person('csv2@example.mn', '@sum');
    await join(o.id, u2, true);
    await done(u, c.id, c.lessons[0]!);

    const { res, buf, text } = await csv(a.agent, o.id);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const disp = res.headers['content-disposition'] as string;
    expect(disp).toMatch(/^attachment; filename="org-[0-9a-f]{8}-report-\d{4}-\d{2}-\d{2}\.csv"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disp.split("filename*=UTF-8''")[1]!)).toMatch(/^Монгол Ложистик-\d{4}-\d{2}-\d{2}\.csv$/);

    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe('Нэр,Утас / имэйл,Курс,Явц (%),Quiz-ийн дундаж (%),Сертификатын код,Сертификат олгосон огноо,Сүүлд идэвхтэй,Гишүүнчлэл');
    // формул `'`-оор саармагжиж, хашилт давхарлагдаж, таслалтай талбар хашилтад орно
    expect(lines[1]).toMatch(/^"'=HYPERLINK\(""http:\/\/evil""\)",csv@example\.mn,"Курс, ""хашилттай""",50,0,,,\d{4}-\d{2}-\d{2},Идэвхтэй$/);
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);

    const all = (await csv(a.agent, o.id, '?includeRemoved=true')).text;
    expect(all).toContain("'@sum");
    expect(all).toContain('Хасагдсан');
    expect(text).not.toContain('@sum');

    const audits = await t.prisma.auditLog.findMany({ where: { action: 'organization.report.export', targetId: o.id } });
    expect(audits).toHaveLength(2);
    expect(audits[0]!.actorId).toBe(a.id);
  });
});
