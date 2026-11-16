import { grantRoleByIdentifier } from '../src/admin/roles';
import { NOTIFICATION_EMAIL_JOB } from '../src/notifications/notifications.service';
import { codeFromEmail, createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

async function admin() {
  const s = await loginByEmail(t, 'admin@example.mn');
  await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
  return s;
}

async function publishAgreement(adminAgent: Agent, body = 'Гэрээний текст') {
  const d = (await adminAgent.post('/admin/legal/teacher-agreement').send({ title: 'Багшийн гэрээ', body }).expect(201))
    .body;
  await adminAgent.post(`/admin/legal/documents/${d.id}/publish`).expect(201);
  return d.version as number;
}

const application = (agreementVersion: number, overrides: object = {}) => ({
  displayName: 'Бат-Эрдэнэ',
  bio: '10 жил програмчлал заасан.',
  expertise: 'JavaScript, Python',
  sampleUrl: 'https://youtube.com/watch?v=abc',
  agreementVersion,
  bankAccount: { bank: 'KHAN', accountNumber: '5000 1234 56', holderName: 'Бат-Эрдэнэ Д.' },
  ...overrides,
});

describe('Өргөдөл гаргах', () => {
  it('баталгаажсан утасгүй бол 403 PHONE_REQUIRED', async () => {
    const a = await admin();
    const v = await publishAgreement(a.agent);
    const { agent } = await loginByEmail(t, 'nophone@example.mn');

    const mine = (await agent.get('/teacher/application').expect(200)).body;
    expect(mine).toMatchObject({ hasVerifiedPhone: false, isTeacher: false, currentAgreementVersion: 1, application: null });

    const res = await agent.post('/teacher/application').send(application(v)).expect(403);
    expect(res.body.code).toBe('PHONE_REQUIRED');
    expect(await t.prisma.teacherApplication.count()).toBe(0);
  });

  it('гэрээ нийтлэгдээгүй бол 409', async () => {
    const { agent } = await loginByPhone(t, '99112233');
    const res = await agent.post('/teacher/application').send(application(1)).expect(409);
    expect(res.body.code).toBe('AGREEMENT_NOT_PUBLISHED');
  });

  it('илгээхэд SUBMITTED, гэрээний хувилбар+огноо, банкны данс хадгалагдаж audit бичигдэнэ', async () => {
    const a = await admin();
    const v = await publishAgreement(a.agent);
    const { agent, user } = await loginByPhone(t, '99112233');

    const res = await agent.post('/teacher/application').send(application(v)).expect(200);
    expect(res.body.application).toMatchObject({
      status: 'SUBMITTED',
      displayName: 'Бат-Эрдэнэ',
      agreementVersion: 1,
      agreementAcceptedAt: expect.any(String),
      reviewNote: null,
    });
    expect(res.body.bankAccount).toMatchObject({ bank: 'KHAN', accountNumber: '5000123456', holderName: 'Бат-Эрдэнэ Д.' });

    const legal = (await agent.get('/me/legal')).body.find((s: { type: string }) => s.type === 'TEACHER_AGREEMENT');
    expect(legal).toMatchObject({ acceptedVersion: 1, upToDate: true });

    const audit = await t.prisma.auditLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((x) => x.action).sort()).toEqual(['bank_account.update', 'teacher_application.submit']);
    // Бүтэн дансны дугаар audit-д хадгалагдахгүй
    expect(JSON.stringify(audit)).not.toContain('5000123456');
  });

  it('хуучин гэрээний хувилбараар илгээвэл 409 VERSION_OUTDATED', async () => {
    const a = await admin();
    await publishAgreement(a.agent, 'v1');
    const v2 = await publishAgreement(a.agent, 'v2');
    const { agent } = await loginByPhone(t, '99112233');
    const res = await agent.post('/teacher/application').send(application(v2 - 1)).expect(409);
    expect(res.body.code).toBe('VERSION_OUTDATED');
    await agent.post('/teacher/application').send(application(v2)).expect(200);
  });

  it('шалгагдаж байх үед дахин илгээх боломжгүй', async () => {
    const a = await admin();
    const v = await publishAgreement(a.agent);
    const { agent } = await loginByPhone(t, '99112233');
    await agent.post('/teacher/application').send(application(v)).expect(200);
    const res = await agent.post('/teacher/application').send(application(v)).expect(409);
    expect(res.body.code).toBe('UNDER_REVIEW');
  });

  it('буруу утга 400 (данс, банк, линк, хоосон талбар)', async () => {
    const a = await admin();
    const v = await publishAgreement(a.agent);
    const { agent } = await loginByPhone(t, '99112233');
    const bad = [
      { bankAccount: { bank: 'KHAN', accountNumber: '12ab', holderName: 'X' } },
      { bankAccount: { bank: 'NOPE', accountNumber: '5000123456', holderName: 'X' } },
      { bankAccount: { bank: 'KHAN', accountNumber: '5000123456', holderName: ' ' } },
      { sampleUrl: 'http://insecure.mn' },
      { sampleUrl: 'javascript:alert(1)' },
      { bio: '' },
    ];
    for (const override of bad) {
      await agent.post('/teacher/application').send(application(v, override)).expect(400);
    }
    // IBAN зөвшөөрөгдөнө
    await agent
      .post('/teacher/application')
      .send(application(v, { bankAccount: { bank: 'GOLOMT', accountNumber: 'mn12 0004 0000 1234 5678', holderName: 'X' } }))
      .expect(200);
    expect((await t.prisma.bankAccount.findFirstOrThrow()).accountNumber).toBe('MN120004000012345678');
  });

  it('нэвтрээгүй бол 401', async () => {
    await t.http().get('/teacher/application').expect(401);
    await t.http().post('/teacher/application').send({}).expect(401);
  });
});

describe('Админы шийдвэр', () => {
  async function submitted() {
    const a = await admin();
    const v = await publishAgreement(a.agent);
    const applicant = await loginByPhone(t, '99112233');
    // имэйлтэй болгож, мэдэгдэл имэйлээр ч очихыг шалгана
    const start = await applicant.agent.post('/me/identifiers/start').send({ type: 'EMAIL', value: 'app@example.mn' });
    await applicant.agent
      .post('/me/identifiers/verify')
      .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, 'app@example.mn') })
      .expect(200);
    await applicant.agent.post('/teacher/application').send(application(v)).expect(200);
    const queue = (await a.agent.get('/admin/teacher-applications').expect(200)).body;
    return { admin: a, applicant, v, appId: queue[0].id as string, queue };
  }

  it('дараалалд хэрэглэгчийн холбоо барих мэдээлэл, банкны данстай харагдана', async () => {
    const { queue, applicant } = await submitted();
    expect(queue).toEqual([
      expect.objectContaining({
        status: 'SUBMITTED',
        user: { id: applicant.user.id, name: null, phone: '+97699112233', email: 'app@example.mn' },
        bankAccount: expect.objectContaining({ accountNumber: '5000123456' }),
      }),
    ]);
  });

  it('зөвшөөрөхөд TEACHER role нэмэгдэж, мэдэгдэл (in-app + имэйл), audit бичигдэнэ', async () => {
    const { admin: a, applicant, appId } = await submitted();
    t.queue.clear();
    t.email.clear();

    await a.agent.post(`/admin/teacher-applications/${appId}/approve`).expect(204);

    const mine = (await applicant.agent.get('/teacher/application')).body;
    expect(mine).toMatchObject({ isTeacher: true, application: { status: 'APPROVED', reviewedAt: expect.any(String) } });
    expect((await applicant.agent.get('/me')).body.roles).toEqual(['LEARNER', 'TEACHER']);

    const bell = (await applicant.agent.get('/notifications')).body.items;
    expect(bell[0]).toMatchObject({ type: 'TEACHER_APPLICATION_APPROVED', link: '/teacher/apply' });
    expect(t.queue.byName(NOTIFICATION_EMAIL_JOB)).toHaveLength(1);
    await t.queue.drain();
    expect(t.email.last('app@example.mn')?.subject).toContain('зөвшөөрөгдлөө');

    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'teacher_application.approve' } });
    expect(audit).toMatchObject({ actorId: a.user.id, targetId: appId, after: { status: 'APPROVED' } });

    // Дахин шийдвэрлэх боломжгүй; багш дахин өргөдөл гаргахгүй
    await a.agent.post(`/admin/teacher-applications/${appId}/reject`).send({ reason: 'x' }).expect(409);
    const again = await applicant.agent.post('/teacher/application').send(application(1)).expect(409);
    expect(again.body.code).toBe('ALREADY_TEACHER');
  });

  it('буцаахад шалтгаан хадгалагдаж, хэрэглэгч засаж дахин илгээж, дараа нь зөвшөөрөгдөнө', async () => {
    const { admin: a, applicant, appId, v } = await submitted();

    await a.agent.post(`/admin/teacher-applications/${appId}/reject`).send({ reason: '' }).expect(400);
    await a.agent
      .post(`/admin/teacher-applications/${appId}/reject`)
      .send({ reason: 'Жишээ контентын линк ажиллахгүй байна' })
      .expect(204);

    let mine = (await applicant.agent.get('/teacher/application')).body;
    expect(mine).toMatchObject({
      isTeacher: false,
      application: { status: 'REJECTED', reviewNote: 'Жишээ контентын линк ажиллахгүй байна' },
    });
    expect((await applicant.agent.get('/notifications')).body.items[0]).toMatchObject({
      type: 'TEACHER_APPLICATION_REJECTED',
      body: expect.stringContaining('Жишээ контентын линк ажиллахгүй байна'),
    });
    expect((await applicant.agent.get('/me')).body.roles).toEqual(['LEARNER']);

    // Засаж дахин илгээх: ижил өргөдөл SUBMITTED болж, шалтгаан цэвэрлэгдэнэ
    await applicant.agent
      .post('/teacher/application')
      .send(application(v, { sampleUrl: 'https://youtube.com/watch?v=fixed' }))
      .expect(200);
    mine = (await applicant.agent.get('/teacher/application')).body;
    expect(mine.application).toMatchObject({
      id: appId,
      status: 'SUBMITTED',
      sampleUrl: 'https://youtube.com/watch?v=fixed',
      reviewNote: null,
    });

    await a.agent.post(`/admin/teacher-applications/${appId}/approve`).expect(204);
    expect((await applicant.agent.get('/me')).body.roles).toContain('TEACHER');

    const actions = (await t.prisma.auditLog.findMany({ where: { targetType: 'teacher_application' }, orderBy: { createdAt: 'asc' } })).map(
      (x) => x.action,
    );
    expect(actions).toEqual([
      'teacher_application.submit',
      'teacher_application.reject',
      'teacher_application.resubmit',
      'teacher_application.approve',
    ]);
  });

  it('админ бус хэрэглэгч дараалал харах, шийдвэрлэх боломжгүй', async () => {
    const { applicant, appId } = await submitted();
    await applicant.agent.get('/admin/teacher-applications').expect(403);
    await applicant.agent.post(`/admin/teacher-applications/${appId}/approve`).expect(403);
    await applicant.agent.post(`/admin/teacher-applications/${appId}/reject`).send({ reason: 'x' }).expect(403);
    expect((await applicant.agent.get('/me')).body.roles).toEqual(['LEARNER']);
  });

  it('төлөвөөр шүүнэ; байхгүй өргөдөл 404', async () => {
    const { admin: a, appId } = await submitted();
    await a.agent.post(`/admin/teacher-applications/${appId}/approve`).expect(204);
    expect((await a.agent.get('/admin/teacher-applications')).body).toHaveLength(0);
    expect((await a.agent.get('/admin/teacher-applications?status=APPROVED')).body).toHaveLength(1);
    await a.agent.post('/admin/teacher-applications/00000000-0000-0000-0000-000000000000/approve').expect(404);
  });
});

describe('Банкны данс засах', () => {
  it('багш дансаа засахад audit (masked) бичигдэж, аюулгүй байдлын мэдэгдэл очно', async () => {
    const a = await admin();
    const v = await publishAgreement(a.agent);
    const { agent, user } = await loginByPhone(t, '99112233');
    await agent.post('/teacher/application').send(application(v)).expect(200);

    const res = await agent
      .put('/teacher/bank-account')
      .send({ bank: 'TDB', accountNumber: '499000111222', holderName: 'Бат-Эрдэнэ Д.' })
      .expect(200);
    expect(res.body).toMatchObject({ bank: 'TDB', accountNumber: '499000111222' });

    const audit = await t.prisma.auditLog.findMany({ where: { action: 'bank_account.update', actorId: user.id } });
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain('499000111222');
    expect(JSON.stringify(audit)).toContain('1222');

    const bell = (await agent.get('/notifications')).body.items;
    expect(bell[0]).toMatchObject({ type: 'BANK_ACCOUNT_CHANGED', body: expect.stringContaining('1222') });

    // өөрчлөлтгүй бол мэдэгдэл, audit нэмэгдэхгүй
    await agent
      .put('/teacher/bank-account')
      .send({ bank: 'TDB', accountNumber: '4990 0011 1222', holderName: 'Бат-Эрдэнэ Д.' })
      .expect(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'bank_account.update' } })).toBe(2);
    expect(await t.prisma.notification.count({ where: { type: 'BANK_ACCOUNT_CHANGED' } })).toBe(1);
  });

  it('өргөдөлгүй, багш биш хэрэглэгч данс оруулах боломжгүй', async () => {
    const { agent } = await loginByPhone(t, '99112233');
    await agent
      .put('/teacher/bank-account')
      .send({ bank: 'KHAN', accountNumber: '5000123456', holderName: 'X' })
      .expect(403);
  });
});
