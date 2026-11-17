import { grantRoleByIdentifier, GrantRoleError } from '../src/admin/roles';
import { SettingsService } from '../src/admin/settings.service';
import { LegalService } from '../src/admin/legal.service';
import { createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

async function loginAdmin(email = 'admin@example.mn') {
  const session = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'ADMIN');
  return session;
}

describe('Админ эрх', () => {
  const adminRoutes: [method: 'get' | 'put' | 'post' | 'patch', path: string, body?: object][] = [
    ['get', '/admin/settings'],
    ['put', '/admin/settings/creditPriceMnt', { value: 1 }],
    ['get', '/admin/settings/creditPriceMnt/history'],
    ['get', '/admin/audit'],
    ['get', '/admin/legal/terms'],
    ['post', '/admin/legal/terms', { title: 'x', body: 'y' }],
    ['patch', '/admin/legal/documents/00000000-0000-0000-0000-000000000000', { title: 'x' }],
    ['post', '/admin/legal/documents/00000000-0000-0000-0000-000000000000/publish'],
  ];

  it('нэвтрээгүй бол 401, админ бус хэрэглэгч (багш ч) 403', async () => {
    const learner = await loginByEmail(t, 'learner@example.mn');
    const teacher = await loginByEmail(t, 'teacher@example.mn');
    await t.prisma.user.update({ where: { id: teacher.user.id }, data: { roles: ['LEARNER', 'TEACHER'] } });

    for (const [method, path, body] of adminRoutes) {
      await t.http()[method](path).send(body).expect(401);
      await learner.agent[method](path).send(body).expect(403);
      await teacher.agent[method](path).send(body).expect(403);
    }
    expect(await t.prisma.setting.count()).toBe(0);
    expect(await t.prisma.legalDocument.count()).toBe(0);
  });

  it('CLI-ийн функц: identifier-ээр ADMIN олгож, audit-д систем үйлдэл болгон бичнэ', async () => {
    const { agent, user } = await loginByPhone(t, '99001122');
    await agent.get('/admin/settings').expect(403);

    const res = await grantRoleByIdentifier(t.prisma, '+976 9900 1122', 'ADMIN');
    expect(res).toMatchObject({ userId: user.id, changed: true, roles: ['LEARNER', 'ADMIN'] });
    await agent.get('/admin/settings').expect(200); // access token шинэчлэх шаардлагагүй

    const again = await grantRoleByIdentifier(t.prisma, '99001122', 'ADMIN');
    expect(again.changed).toBe(false);

    const audit = await t.prisma.auditLog.findMany();
    expect(audit).toEqual([
      expect.objectContaining({
        actorId: null,
        action: 'user.role.grant',
        targetId: user.id,
        before: { roles: ['LEARNER'] },
        after: { roles: ['LEARNER', 'ADMIN'] },
      }),
    ]);
  });

  it('бүртгэлгүй identifier-т алдаа', async () => {
    await expect(grantRoleByIdentifier(t.prisma, 'nobody@example.mn', 'ADMIN')).rejects.toBeInstanceOf(GrantRoleError);
    await expect(grantRoleByIdentifier(t.prisma, 'garbage', 'ADMIN')).rejects.toBeInstanceOf(GrantRoleError);
  });
});

describe('Тохиргоо', () => {
  it('анхдагч утгууд', async () => {
    const { agent } = await loginAdmin();
    const res = await agent.get('/admin/settings').expect(200);
    const values = Object.fromEntries(res.body.map((s: { key: string; value: number }) => [s.key, s.value]));
    expect(values).toEqual({
      creditPriceMnt: 1000,
      commissionPlatformPercent: 40,
      commissionReferralPercent: 10,
      referralWindowDays: 30,
      payoutMinimumMnt: 50_000,
      creditValidityMonths: 12,
      reviewMinOwnedPercent: 30,
    });
    expect(res.body.every((s: { updatedAt: unknown }) => s.updatedAt === null)).toBe(true);
    expect(await t.app.get(SettingsService).get('payoutMinimumMnt')).toBe(50_000);
  });

  it('өөрчлөхөд утга хадгалагдаж, түүх болон audit (хэн, өмнөх/дараах) бичигдэнэ', async () => {
    const { agent, user } = await loginAdmin();

    const res = await agent.put('/admin/settings/creditPriceMnt').send({ value: 1200 }).expect(200);
    expect(res.body).toMatchObject({ key: 'creditPriceMnt', value: 1200, defaultValue: 1000 });
    await agent.put('/admin/settings/creditPriceMnt').send({ value: 1500 }).expect(200);

    expect(await t.app.get(SettingsService).get('creditPriceMnt')).toBe(1500);

    const history = await agent.get('/admin/settings/creditPriceMnt/history').expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({ previous: 1200, value: 1500, changedBy: { id: user.id, name: null } }),
      expect.objectContaining({ previous: 1000, value: 1200 }),
    ]);

    const audit = await agent.get('/admin/audit?action=setting.update').expect(200);
    expect(audit.body.items).toEqual([
      expect.objectContaining({
        actor: { id: user.id, name: null },
        targetType: 'setting',
        targetId: 'creditPriceMnt',
        before: { value: 1200 },
        after: { value: 1500 },
      }),
      expect.objectContaining({ before: { value: 1000 }, after: { value: 1200 } }),
    ]);
  });

  it('ижил утга дахин тавихад түүх, audit нэмэгдэхгүй', async () => {
    const { agent } = await loginAdmin();
    await agent.put('/admin/settings/referralWindowDays').send({ value: 45 }).expect(200);
    await agent.put('/admin/settings/referralWindowDays').send({ value: 45 }).expect(200);
    expect(await t.prisma.settingRevision.count()).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'setting.update' } })).toBe(1);
  });

  it('утгын төрөл, хязгаар шалгана; буруу бол юу ч өөрчлөгдөхгүй', async () => {
    const { agent } = await loginAdmin();
    for (const value of [101, -1, 12.5, '40', null, true]) {
      const res = await agent.put('/admin/settings/commissionPlatformPercent').send({ value }).expect(400);
      expect(res.body.code).toBe('INVALID_SETTING_VALUE');
    }
    await agent.put('/admin/settings/creditPriceMnt').send({ value: 0 }).expect(400);
    await agent.put('/admin/settings/unknownKey').send({ value: 1 }).expect(404);
    expect(await t.prisma.setting.count()).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'setting.update' } })).toBe(0);
  });
});

describe('Audit log', () => {
  it('хуудаслалт, шинэ нь эхэндээ', async () => {
    const { agent } = await loginAdmin();
    for (const value of [31, 32, 33]) {
      await agent.put('/admin/settings/referralWindowDays').send({ value }).expect(200);
    }
    // grant (1) + 3 өөрчлөлт
    const p1 = (await agent.get('/admin/audit?limit=2').expect(200)).body;
    expect(p1.items.map((i: { after: { value?: number } }) => i.after.value)).toEqual([33, 32]);
    const p2 = (await agent.get(`/admin/audit?limit=2&before=${p1.nextCursor}`)).body;
    expect(p2.items.map((i: { action: string }) => i.action)).toEqual(['setting.update', 'user.role.grant']);
    expect(p2.nextCursor).toBeNull();
  });
});

describe('Хууль эрх зүйн хуудас', () => {
  it('ноорог нийтэд харагдахгүй; нийтэлсний дараа харагдана; нийтэлсэн хувилбар засагдахгүй', async () => {
    const { agent } = await loginAdmin();
    await t.http().get('/legal/terms').expect(404);

    const draft = await agent
      .post('/admin/legal/terms')
      .send({ title: 'Үйлчилгээний нөхцөл', body: 'Нэгдүгээр зүйл...' })
      .expect(201);
    expect(draft.body).toMatchObject({ type: 'TERMS', version: 1, publishedAt: null });
    await t.http().get('/legal/terms').expect(404);

    await agent.patch(`/admin/legal/documents/${draft.body.id}`).send({ body: 'Засварласан текст' }).expect(200);
    await agent.post(`/admin/legal/documents/${draft.body.id}/publish`).expect(201);

    const pub = await t.http().get('/legal/terms').expect(200);
    expect(pub.body).toMatchObject({ version: 1, title: 'Үйлчилгээний нөхцөл', body: 'Засварласан текст' });
    expect(pub.body.publishedAt).not.toBeNull();

    const edit = await agent.patch(`/admin/legal/documents/${draft.body.id}`).send({ body: 'hack' }).expect(409);
    expect(edit.body.code).toBe('ALREADY_PUBLISHED');
    await agent.post(`/admin/legal/documents/${draft.body.id}/publish`).expect(409);
  });

  it('шинэ хувилбар нийтлэхэд одоогийнх солигдож, хуучин хувилбар түүхэнд үлдэнэ', async () => {
    const { agent } = await loginAdmin();
    const v1 = (await agent.post('/admin/legal/privacy').send({ title: 'Нууцлал', body: 'v1' })).body;
    await agent.post(`/admin/legal/documents/${v1.id}/publish`).expect(201);
    const v2 = (await agent.post('/admin/legal/privacy').send({ title: 'Нууцлал', body: 'v2' }).expect(201)).body;
    expect(v2.version).toBe(2);

    // нэг төрөлд зэрэг хоёр ноорог байхгүй
    const dup = await agent.post('/admin/legal/privacy').send({ title: 'x', body: 'y' }).expect(409);
    expect(dup.body.code).toBe('DRAFT_EXISTS');

    expect((await t.http().get('/legal/privacy')).body.version).toBe(1);
    await agent.post(`/admin/legal/documents/${v2.id}/publish`).expect(201);
    expect((await t.http().get('/legal/privacy')).body).toMatchObject({ version: 2, body: 'v2' });
    expect((await t.http().get('/legal/privacy/versions/1').expect(200)).body.body).toBe('v1');

    const versions = (await agent.get('/admin/legal/privacy').expect(200)).body;
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    const actions = (await t.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual([
      'user.role.grant',
      'legal.draft.create',
      'legal.publish',
      'legal.draft.create',
      'legal.publish',
    ]);
  });

  it('ноорог хувилбарыг дугаараар нь нийтээс харах боломжгүй; буруу slug 404', async () => {
    const { agent } = await loginAdmin();
    await agent.post('/admin/legal/teacher-agreement').send({ title: 'Гэрээ', body: 'draft' }).expect(201);
    await t.http().get('/legal/teacher-agreement/versions/1').expect(404);
    await t.http().get('/legal/cookies').expect(404);
  });
});

describe('Нөхцөл зөвшөөрөх', () => {
  async function publish(slug: string, body: string) {
    const admin = await loginAdmin(`admin-${slug}-${body}@example.mn`);
    const d = (await admin.agent.post(`/admin/legal/${slug}`).send({ title: slug, body }).expect(201)).body;
    await admin.agent.post(`/admin/legal/documents/${d.id}/publish`).expect(201);
    return d.version as number;
  }

  it('одоогийн хувилбарыг зөвшөөрч, хувилбар болон огноо бүртгэгдэнэ; шинэ хувилбар гарвал дахин шаардлагатай', async () => {
    const v1 = await publish('teacher-agreement', 'v1');
    const { agent, user } = await loginByPhone(t, '95551234');
    const legal = t.app.get(LegalService);

    let status = (await agent.get('/me/legal').expect(200)).body;
    expect(status.find((s: { type: string }) => s.type === 'TEACHER_AGREEMENT')).toMatchObject({
      currentVersion: 1,
      acceptedVersion: null,
      upToDate: false,
    });
    expect(await legal.hasAcceptedCurrent(user.id, 'TEACHER_AGREEMENT')).toBe(false);

    const accepted = await agent.post('/legal/teacher-agreement/accept').send({ version: v1 }).expect(201);
    expect(accepted.body).toMatchObject({ acceptedVersion: 1, upToDate: true });
    expect(accepted.body.acceptedAt).toEqual(expect.any(String));
    await agent.post('/legal/teacher-agreement/accept').send({ version: v1 }).expect(201); // давхар бол асуудалгүй
    expect(await t.prisma.legalAcceptance.count()).toBe(1);
    expect(await legal.hasAcceptedCurrent(user.id, 'TEACHER_AGREEMENT')).toBe(true);

    await publish('teacher-agreement', 'v2');
    expect(await legal.hasAcceptedCurrent(user.id, 'TEACHER_AGREEMENT')).toBe(false);

    const stale = await agent.post('/legal/teacher-agreement/accept').send({ version: v1 }).expect(409);
    expect(stale.body.code).toBe('VERSION_OUTDATED');
    await agent.post('/legal/teacher-agreement/accept').send({ version: 2 }).expect(201);
    status = (await agent.get('/me/legal')).body;
    expect(status.find((s: { type: string }) => s.type === 'TEACHER_AGREEMENT')).toMatchObject({
      currentVersion: 2,
      acceptedVersion: 2,
      upToDate: true,
    });
  });

  it('нийтлээгүй баримтыг зөвшөөрөх боломжгүй; нэвтрээгүй бол 401', async () => {
    const { agent } = await loginByEmail(t, 'u@example.mn');
    await agent.post('/legal/terms/accept').send({ version: 1 }).expect(404);
    await t.http().post('/legal/terms/accept').send({ version: 1 }).expect(401);
  });
});
