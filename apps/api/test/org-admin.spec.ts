import type { OrgAdminDetail, OrgAdminRow, OrgInviteResult } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { hasOrgCourseAccess } from '../src/organizations/org-access';
import { createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

// Алслагдсан DB (~200мс/хүсэлт).
jest.setTimeout(180_000);

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

const YEAR = 365 * 24 * 60 * 60_000;

async function admin(): Promise<Agent> {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s.agent;
}

async function createOrg(a: Agent, seatLimit = 5, name = 'Тест ХК'): Promise<OrgAdminRow> {
  const res = await a
    .post('/admin/organizations')
    .send({ name, seatLimit, contractEndsAt: new Date(Date.now() + YEAR).toISOString() })
    .expect(201);
  return res.body;
}

async function invite(a: Agent, orgId: string, text: string): Promise<OrgInviteResult> {
  return (await a.post(`/admin/organizations/${orgId}/invitations`).send({ text }).expect(200)).body;
}

async function detail(a: Agent, orgId: string): Promise<OrgAdminDetail> {
  return (await a.get(`/admin/organizations/${orgId}`).expect(200)).body;
}

const outcomes = (r: OrgInviteResult) => r.results.map((x) => x.outcome);

describe('Байгууллагын CRUD ба эрх', () => {
  it('зөвхөн ADMIN: нэвтрээгүй 401, энгийн хэрэглэгч 403', async () => {
    await t.http().get('/admin/organizations').expect(401);
    const { agent } = await loginByEmail(t, 'u@example.mn');
    await agent.get('/admin/organizations').expect(403);
    await agent.post('/admin/organizations').send({ name: 'x', seatLimit: 1, contractEndsAt: new Date().toISOString() }).expect(403);
  });

  it('үүсгэх, жагсаалт (гишүүн/суудал тоо, төлөв), засах, audit log', async () => {
    const a = await admin();
    const org = await createOrg(a, 3);
    expect(org).toMatchObject({ name: 'Тест ХК', active: true, seatLimit: 3, memberCount: 0, pendingCount: 0, status: 'ACTIVE' });

    await invite(a, org.id, '99112233\nnew@example.mn');
    const list = (await a.get('/admin/organizations').expect(200)).body as OrgAdminRow[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ memberCount: 0, pendingCount: 2, seatLimit: 3, status: 'ACTIVE' });

    // сунгах, суудал өөрчлөх, идэвхгүй болгох
    const later = new Date(Date.now() + 2 * YEAR).toISOString();
    const upd = await a.patch(`/admin/organizations/${org.id}`).send({ contractEndsAt: later, seatLimit: 10 }).expect(200);
    expect(upd.body).toMatchObject({ seatLimit: 10, contractEndsAt: later, pendingCount: 2 });
    const off = await a.patch(`/admin/organizations/${org.id}`).send({ active: false }).expect(200);
    expect(off.body.status).toBe('INACTIVE');
    const expired = await a.patch(`/admin/organizations/${org.id}`).send({ active: true, contractEndsAt: new Date(Date.now() - 1000).toISOString() }).expect(200);
    expect(expired.body.status).toBe('EXPIRED');

    await a.patch(`/admin/organizations/${org.id}`).send({}).expect(400);
    await a.patch(`/admin/organizations/${org.id}`).send({ seatLimit: 0 }).expect(400);
    await a.get('/admin/organizations/00000000-0000-4000-8000-000000000999').expect(404);

    const actions = (await t.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['organization.create', 'organization.invitation.create', 'organization.update']));
    expect(actions.filter((x) => x === 'organization.update')).toHaveLength(3);
    const create = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'organization.create' } });
    expect(create.targetId).toBe(org.id);
  });
});

describe('Урилга ба суудал', () => {
  it('олон мөр paste: мөр бүрийн үр дүн (урьсан / буруу формат / давхар)', async () => {
    const a = await admin();
    const org = await createOrg(a, 10);
    const r = await invite(a, org.id, '99112233\n+976 88001122\nbad-value\nA@Example.mn\n99112233\n   \na@example.mn');
    expect(outcomes(r)).toEqual(['INVITED', 'INVITED', 'INVALID', 'INVITED', 'ALREADY_INVITED', 'ALREADY_INVITED']);
    expect(r.results[3]!.value).toBe('a@example.mn');
    expect(r.results[2]!.value).toBeNull();
    const d = await detail(a, org.id);
    expect(d.invitations.map((i) => i.value).sort()).toEqual(['+97688001122', '+97699112233', 'a@example.mn']);
    await a.post(`/admin/organizations/${org.id}/invitations`).send({ text: '' }).expect(400);
  });

  it('суудлын хязгаар: pending + идэвхтэй гишүүд <= seat_limit', async () => {
    const a = await admin();
    await loginByEmail(t, 'm@example.mn'); // бүртгэлтэй хэрэглэгч — шууд гишүүн
    const org = await createOrg(a, 2);
    const r = await invite(a, org.id, 'm@example.mn\n99112233\n99223344\nx@example.mn');
    expect(outcomes(r)).toEqual(['ADDED', 'INVITED', 'NO_SEATS', 'NO_SEATS']);
    const d = await detail(a, org.id);
    expect(d.memberCount + d.pendingCount).toBe(2);
    // давхар бүртгэлтэй гишүүн суудал хэрэглэхгүй (аль хэдийн гишүүн)
    expect(outcomes(await invite(a, org.id, 'm@example.mn'))).toEqual(['ALREADY_MEMBER']);
  });

  it('зэрэг урилга суудлыг хэтрүүлэхгүй (row lock)', async () => {
    const a = await admin();
    const org = await createOrg(a, 3);
    const batches = await Promise.all(
      [0, 1, 2, 3].map((i) => invite(a, org.id, `9900000${i}\n9900001${i}`)),
    );
    const invited = batches.flatMap((b) => b.results).filter((x) => x.outcome === 'INVITED');
    expect(invited).toHaveLength(3);
    expect(await t.prisma.organizationInvitation.count({ where: { organizationId: org.id, status: 'PENDING' } })).toBe(3);
  });

  it('бүртгэлтэй (баталгаажсан) identifier тэр дороо гишүүн болж, in-app мэдэгдэл авна', async () => {
    const a = await admin();
    const { agent: u } = await loginByPhone(t, '99001122');
    const org = await createOrg(a);
    expect(outcomes(await invite(a, org.id, '99001122'))).toEqual(['ADDED']);
    const d = await detail(a, org.id);
    expect(d.members).toHaveLength(1);
    expect(d.members[0]).toMatchObject({ phone: '+97699001122' });
    expect(d.pendingCount).toBe(0);
    const n = (await u.get('/notifications').expect(200)).body.items as { type: string }[];
    expect(n.map((x) => x.type)).toContain('ORG_JOINED');
  });

  it('имэйл урилга дараалалаар нэвтрэх линктэй явна; утсанд мэдэгдэл явахгүй', async () => {
    const a = await admin();
    const org = await createOrg(a);
    t.queue.clear();
    t.email.clear();
    await invite(a, org.id, 'guest@example.mn\n99887766');
    await t.queue.drain();
    const mail = t.email.sent.filter((m) => m.to === 'guest@example.mn');
    expect(mail).toHaveLength(1);
    expect(mail[0]!.text).toContain('/login');
    expect(mail[0]!.subject).toContain('Тест ХК');
    expect(t.email.sent.map((m) => m.to)).toEqual(['guest@example.mn']);
    expect(t.phone.sessions).toHaveLength(0);
  });
});

describe('Нэвтрэлтээр урилга -> гишүүнчлэл', () => {
  it('утсаар OTP нэвтрэхэд pending урилга гишүүнчлэл болно', async () => {
    const a = await admin();
    const org = await createOrg(a);
    await invite(a, org.id, '99556677');
    const { user } = await loginByPhone(t, '99556677');
    const d = await detail(a, org.id);
    expect(d.pendingCount).toBe(0);
    expect(d.members.map((m) => m.userId)).toEqual([user.id]);
    const inv = await t.prisma.organizationInvitation.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(inv.status).toBe('ACCEPTED');
    expect(inv.acceptedAt).not.toBeNull();
  });

  it('имэйлээр OTP нэвтрэхэд гишүүн болж, in-app мэдэгдэл авна', async () => {
    const a = await admin();
    const org = await createOrg(a);
    await invite(a, org.id, 'Staff@Example.mn');
    const { agent, user } = await loginByEmail(t, 'staff@example.mn');
    expect((await detail(a, org.id)).members.map((m) => m.userId)).toEqual([user.id]);
    const n = (await agent.get('/notifications').expect(200)).body.items as { type: string; title: string }[];
    expect(n.find((x) => x.type === 'ORG_JOINED')?.title).toContain('Тест ХК');
  });

  it('identifier холбож баталгаажуулахад мөн гишүүн болно', async () => {
    const a = await admin();
    const org = await createOrg(a);
    await invite(a, org.id, '95005000');
    const { agent, user } = await loginByEmail(t, 'link@example.mn');
    expect((await detail(a, org.id)).members).toHaveLength(0);
    const start = await agent.post('/me/identifiers/start').send({ type: 'PHONE', value: '95005000' }).expect(200);
    t.phone.markVerified('95005000');
    await agent.post('/me/identifiers/verify').send({ challengeId: start.body.challengeId }).expect(200);
    const d = await detail(a, org.id);
    expect(d.members.map((m) => m.userId)).toEqual([user.id]);
    expect(d.pendingCount).toBe(0);
  });

  it('idempotent: дахин нэвтэрэхэд давхар гишүүнчлэл/мэдэгдэл үүсэхгүй', async () => {
    const a = await admin();
    const org = await createOrg(a);
    await invite(a, org.id, 'twice@example.mn');
    await loginByEmail(t, 'twice@example.mn');
    await loginByEmail(t, 'twice@example.mn');
    expect(await t.prisma.organizationMember.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await t.prisma.notification.count({ where: { type: 'ORG_JOINED' } })).toBe(1);
  });

  it('гишүүнчлэл идэвхтэй байгууллагад курсийн эрх өгөх дүрэмд (org-access) нэгдэнэ', async () => {
    const a = await admin();
    const org = await createOrg(a);
    await invite(a, org.id, 'acc@example.mn');
    const { user } = await loginByEmail(t, 'acc@example.mn');
    const teacher = await t.prisma.user.create({ data: { name: 'T', roles: ['TEACHER'] } });
    const course = await t.prisma.course.create({ data: { teacherId: teacher.id, title: 'C', visibility: 'PRIVATE', status: 'PUBLISHED', publishedAt: new Date() } });
    await t.prisma.organizationCourseGrant.create({ data: { organizationId: org.id, courseId: course.id } });
    expect(await hasOrgCourseAccess(t.prisma, user.id, course.id)).toBe(true);
  });
});

describe('Хасах, цуцлах, дахин урих', () => {
  it('гишүүн хасахад суудал чөлөөлөгдөж, дахин урихад шинэ идэвхтэй мөр үүснэ', async () => {
    const a = await admin();
    const org = await createOrg(a, 1);
    await invite(a, org.id, 'gone@example.mn');
    const { user } = await loginByEmail(t, 'gone@example.mn');
    let d = await detail(a, org.id);
    expect(d.memberCount).toBe(1);
    expect(outcomes(await invite(a, org.id, 'other@example.mn'))).toEqual(['NO_SEATS']);

    await a.delete(`/admin/organizations/${org.id}/members/${d.members[0]!.id}`).expect(204);
    await a.delete(`/admin/organizations/${org.id}/members/${d.members[0]!.id}`).expect(404);
    d = await detail(a, org.id);
    expect(d.memberCount).toBe(0);
    expect(await hasOrgCourseAccessAny(user.id)).toBe(false);

    // суудал чөлөөлөгдсөн
    expect(outcomes(await invite(a, org.id, 'other@example.mn'))).toEqual(['INVITED']);
    await a.delete(`/admin/organizations/${org.id}/invitations/${(await detail(a, org.id)).invitations[0]!.id}`).expect(204);

    // хасагдсан хэрэглэгчийг дахин урихад: бүртгэлтэй тул шууд шинэ идэвхтэй мөр
    expect(outcomes(await invite(a, org.id, 'gone@example.mn'))).toEqual(['ADDED']);
    const rows = await t.prisma.organizationMember.findMany({ where: { organizationId: org.id, userId: user.id } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.removedAt === null)).toHaveLength(1);
  });

  it('pending урилга цуцлахад суудал чөлөөлөгдөж, цуцлагдсан урилга нэвтрэхэд гишүүн болгохгүй', async () => {
    const a = await admin();
    const org = await createOrg(a, 1);
    await invite(a, org.id, 'c@example.mn');
    expect(outcomes(await invite(a, org.id, 'd@example.mn'))).toEqual(['NO_SEATS']);
    const inv = (await detail(a, org.id)).invitations[0]!;
    await a.delete(`/admin/organizations/${org.id}/invitations/${inv.id}`).expect(204);
    await a.delete(`/admin/organizations/${org.id}/invitations/${inv.id}`).expect(404);
    expect((await detail(a, org.id)).pendingCount).toBe(0);

    await loginByEmail(t, 'c@example.mn');
    expect((await detail(a, org.id)).memberCount).toBe(0);
    expect(outcomes(await invite(a, org.id, 'c@example.mn'))).toEqual(['ADDED']);

    const actions = (await t.prisma.auditLog.findMany()).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['organization.invitation.cancel', 'organization.member.add']));
  });

  it('хасалт audit log-д; өөр байгууллагын гишүүн/урилгыг хасах боломжгүй', async () => {
    const a = await admin();
    const o1 = await createOrg(a, 3, 'А');
    const o2 = await createOrg(a, 3, 'Б');
    await invite(a, o1.id, 'x@example.mn');
    await loginByEmail(t, 'x@example.mn');
    await invite(a, o1.id, 'y@example.mn');
    const d1 = await detail(a, o1.id);
    await a.delete(`/admin/organizations/${o2.id}/members/${d1.members[0]!.id}`).expect(404);
    await a.delete(`/admin/organizations/${o2.id}/invitations/${d1.invitations[0]!.id}`).expect(404);
    await a.delete(`/admin/organizations/${o1.id}/members/${d1.members[0]!.id}`).expect(204);
    const log = await t.prisma.auditLog.findFirst({ where: { action: 'organization.member.remove' } });
    expect(log?.targetId).toBe(o1.id);
  });
});

async function hasOrgCourseAccessAny(userId: string): Promise<boolean> {
  return (await t.prisma.organizationMember.count({ where: { userId, removedAt: null } })) > 0;
}

