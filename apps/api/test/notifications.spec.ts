import { CLEANUP_CRON, CLEANUP_JOB } from '../src/maintenance/maintenance.module';
import { NOTIFICATION_EMAIL_JOB, NotificationsService } from '../src/notifications/notifications.service';
import { codeFromEmail, createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

let t: TestApp;
let notifications: NotificationsService;

beforeAll(async () => {
  t = await createTestApp();
  notifications = t.app.get(NotificationsService);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

/** Нэвтэрсний дараах (OTP) имэйлүүдийг цэвэрлэж, зөвхөн мэдэгдлийн имэйлийг шалгах */
function clearSentEmails() {
  t.email.clear();
}

describe('notify: in-app + имэйл', () => {
  it('имэйлтэй хэрэглэгч бүртгүүлэхэд хонхонд мэдэгдэл орж, имэйлийн ажил дараалалд нэмэгдэнэ', async () => {
    const { agent } = await loginByEmail(t, 'new@example.mn');
    clearSentEmails();

    const list = await agent.get('/notifications').expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ type: 'WELCOME', title: 'LMS-д тавтай морил!', link: '/me', readAt: null }),
    ]);
    expect((await agent.get('/notifications/unread-count').expect(200)).body).toEqual({ count: 1 });

    expect(t.queue.byName(NOTIFICATION_EMAIL_JOB)).toHaveLength(1);
    expect(t.email.sent).toHaveLength(0); // ажил хараахан ажиллаагүй

    await t.queue.drain();

    const mail = t.email.last('new@example.mn');
    expect(mail?.subject).toBe('LMS-д тавтай морил');
    expect(mail?.text).toContain('Таны бүртгэл амжилттай үүслээ');
    expect(mail?.text).toContain('http://localhost:3000/me');
    expect(mail?.html).toContain('<h2');
    const row = await t.prisma.notification.findFirstOrThrow();
    expect(row.emailStatus).toBe('SENT');
    expect(row.emailSentAt).not.toBeNull();
  });

  it('утсаар л бүртгэлтэй хэрэглэгчид имэйлийн ажил үүсэхгүй, зөвхөн in-app', async () => {
    const { agent } = await loginByPhone(t, '99112233');

    const list = await agent.get('/notifications').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(t.queue.byName(NOTIFICATION_EMAIL_JOB)).toHaveLength(0);
    expect((await t.prisma.notification.findFirstOrThrow()).emailStatus).toBe('NONE');

    await t.queue.drain();
    expect(t.email.sent).toHaveLength(0);
  });

  it('утастай хэрэглэгч имэйл холбосны дараах мэдэгдэл имэйлээр ч очно', async () => {
    const { agent } = await loginByPhone(t, '88112233');
    const start = await agent.post('/me/identifiers/start').send({ type: 'EMAIL', value: 'later@example.mn' });
    await agent
      .post('/me/identifiers/verify')
      .send({ challengeId: start.body.challengeId, code: codeFromEmail(t, 'later@example.mn') })
      .expect(200);
    clearSentEmails();

    const jobs = t.queue.byName(NOTIFICATION_EMAIL_JOB);
    expect(jobs).toHaveLength(1); // WELCOME нь имэйлгүй үед үүссэн тул зөвхөн IDENTIFIER_LINKED
    await t.queue.drain();
    expect(t.email.last('later@example.mn')?.text).toContain('later@example.mn холбогдлоо');
  });

  it('имэйл дэх параметрийг HTML escape хийнэ', async () => {
    const { user } = await loginByEmail(t, 'esc@example.mn');
    await notifications.notify({
      userId: user.id,
      type: 'IDENTIFIER_LINKED',
      params: { value: '<script>alert(1)</script>' },
    });
    clearSentEmails();
    await t.queue.drain();
    const html = t.email.sent.map((m) => m.html).join('\n');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('Имэйлийн retry', () => {
  it('түр алдааны дараа дахин оролдож илгээнэ', async () => {
    const { user } = await loginByEmail(t, 'retry@example.mn');
    clearSentEmails();
    const send = jest
      .spyOn(t.email, 'send')
      .mockRejectedValueOnce(new Error('Resend 500'))
      .mockRejectedValueOnce(new Error('timeout'));

    await t.queue.drain();

    expect(send).toHaveBeenCalledTimes(3);
    expect(t.email.sent).toHaveLength(1);
    const [job] = t.queue.byName(NOTIFICATION_EMAIL_JOB);
    expect(job).toMatchObject({ status: 'completed', attempts: 3 });
    expect((await t.prisma.notification.findFirstOrThrow({ where: { userId: user.id } })).emailStatus).toBe('SENT');
    send.mockRestore();
  });

  it('5 оролдлогын дараа FAILED, in-app мэдэгдэл хэвээр', async () => {
    const { agent, user } = await loginByEmail(t, 'down@example.mn');
    const send = jest.spyOn(t.email, 'send').mockRejectedValue(new Error('Resend down'));

    await t.queue.drain();

    expect(send).toHaveBeenCalledTimes(5);
    expect(t.queue.byName(NOTIFICATION_EMAIL_JOB)[0]).toMatchObject({ status: 'failed', attempts: 5 });
    expect((await t.prisma.notification.findFirstOrThrow({ where: { userId: user.id } })).emailStatus).toBe('FAILED');
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(1);
    send.mockRestore();
  });

  it('аль хэдийн илгээсэн бол дахин ажиллахад давхар илгээхгүй', async () => {
    await loginByEmail(t, 'once@example.mn');
    await t.queue.drain();
    const [job] = t.queue.byName(NOTIFICATION_EMAIL_JOB);
    clearSentEmails();

    await t.queue.add(NOTIFICATION_EMAIL_JOB, job!.data); // өөр jobId-тай дахин ирсэн гэж үзье
    await t.queue.drain();
    expect(t.email.sent).toHaveLength(0);
  });
});

describe('Хонх', () => {
  async function seed(userId: string, n: number) {
    for (let i = 0; i < n; i++) {
      await notifications.notify({ userId, type: 'IDENTIFIER_LINKED', params: { value: `v${i}` } });
    }
  }

  it('уншсан гэж тэмдэглэх, бүгдийг уншсан болгох', async () => {
    const { agent, user } = await loginByEmail(t, 'bell@example.mn');
    await seed(user.id, 2);
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(3);

    const { items } = (await agent.get('/notifications').expect(200)).body;
    await agent.post(`/notifications/${items[0].id}/read`).expect(204);
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(2);
    const after = (await agent.get('/notifications')).body.items;
    expect(after[0].readAt).not.toBeNull();

    await agent.post('/notifications/read-all').expect(204);
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(0);
  });

  it('шинэ нь эхэндээ, cursor-оор хуудаслана', async () => {
    const { agent, user } = await loginByEmail(t, 'page@example.mn');
    await seed(user.id, 4); // нийт 5

    const p1 = (await agent.get('/notifications?limit=2').expect(200)).body;
    expect(p1.items.map((i: { body: string }) => i.body)).toEqual([
      expect.stringContaining('v3'),
      expect.stringContaining('v2'),
    ]);
    const p2 = (await agent.get(`/notifications?limit=2&before=${p1.nextCursor}`)).body;
    const p3 = (await agent.get(`/notifications?limit=2&before=${p2.nextCursor}`)).body;
    expect(p3.items).toHaveLength(1);
    expect(p3.items[0].type).toBe('WELCOME');
    expect(p3.nextCursor).toBeNull();
  });

  it('бусдын мэдэгдлийг харах, тэмдэглэх боломжгүй', async () => {
    const a = await loginByEmail(t, 'a@example.mn');
    const b = await loginByEmail(t, 'b@example.mn');
    const aItem = (await a.agent.get('/notifications')).body.items[0];

    expect((await b.agent.get('/notifications')).body.items.map((i: { id: string }) => i.id)).not.toContain(aItem.id);
    await b.agent.post(`/notifications/${aItem.id}/read`).expect(404);
    await b.agent.post('/notifications/read-all').expect(204);
    expect((await a.agent.get('/notifications/unread-count')).body.count).toBe(1);
  });

  it('нэвтрээгүй бол 401, буруу id 400', async () => {
    await t.http().get('/notifications').expect(401);
    const { agent } = await loginByEmail(t, 'x@example.mn');
    await agent.post('/notifications/not-a-uuid/read').expect(400);
    await agent.get('/notifications?limit=500').expect(400);
  });
});

describe('Cron', () => {
  it('цэвэрлэгээний ажил өдөр бүр бүртгэгдсэн, хуучин OTP/session-ийг устгана', async () => {
    expect(t.queue.schedules.get(CLEANUP_JOB)).toBe(CLEANUP_CRON);

    const { user } = await loginByEmail(t, 'cron@example.mn');
    const old = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    await t.prisma.otpChallenge.updateMany({ data: { createdAt: old } });
    await t.prisma.session.create({
      data: { userId: user.id, familyId: user.id, tokenHash: 'expired', expiresAt: old },
    });
    const fresh = await t.http().post('/auth/otp/start').send({ type: 'EMAIL', value: 'fresh@example.mn' });

    await t.queue.runScheduled(CLEANUP_JOB);

    expect(await t.prisma.otpChallenge.findMany({ select: { id: true } })).toEqual([{ id: fresh.body.challengeId }]);
    expect(await t.prisma.session.count({ where: { tokenHash: 'expired' } })).toBe(0);
    expect(await t.prisma.session.count()).toBe(1); // идэвхтэй session үлдэнэ
  });
});
