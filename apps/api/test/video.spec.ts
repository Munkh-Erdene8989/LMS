import type { LessonReviewStatus, Prisma } from '@lms/db';
import { PLAYBACK_SESSION_TTL_SECONDS } from '@lms/shared';
import { grantRoleByIdentifier } from '../src/admin/roles';
import { CREDIT_TX_OPTIONS, CreditsService } from '../src/credits/credits.service';
import { MUX_DELETE_ASSET_JOB, MUX_WEBHOOK_JOB } from '../src/media/video.service';
import { createTestApp, loginByEmail, loginByPhone, type TestApp } from './harness';

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

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

async function fund(userId: string, amount = 100) {
  await t.prisma.$transaction((tx) => credits.grant(tx, { userId, credits: amount, source: 'ADMIN_ADJUST' }), CREDIT_TX_OPTIONS);
}

/** Багш HTTP-ээр DRAFT курс + VIDEO хичээл үүсгэнэ. */
async function draftVideoLesson(agent: Agent) {
  const course = (await agent.post('/teacher/courses').send({ title: 'Видео курс' }).expect(201)).body;
  const withSection = (await agent.post(`/teacher/courses/${course.id}/sections`).send({ title: '1' }).expect(201)).body;
  const d = (
    await agent.post(`/teacher/sections/${withSection.sections[0].id}/lessons`).send({ title: 'Танилцуулга', type: 'VIDEO' }).expect(201)
  ).body;
  return { courseId: course.id as string, lessonId: d.sections[0].lessons[0].id as string };
}

/** Нийтлэгдсэн курс + APPROVED VIDEO хичээл (DB-д шууд), бэлэн видеотой. */
async function publishedVideo(
  teacherId: string,
  opts: { status?: 'READY' | 'PROCESSING' | null; preview?: boolean; reviewStatus?: LessonReviewStatus; fromLive?: boolean } = {},
) {
  const status = opts.status === undefined ? 'READY' : opts.status;
  const course = await t.prisma.course.create({
    data: {
      teacherId,
      title: 'Нийтлэгдсэн курс',
      priceCredits: 10,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: { create: { title: '1', position: 0 } },
    },
    include: { sections: true },
  });
  const lesson = await t.prisma.lesson.create({
    data: {
      courseId: course.id,
      sectionId: course.sections[0]!.id,
      title: 'Видео хичээл',
      type: 'VIDEO',
      position: 0,
      priceCredits: 5,
      isFreePreview: opts.preview ?? false,
      reviewStatus: opts.reviewStatus ?? 'APPROVED',
      content: {},
    },
  });
  let videoId: string | null = null;
  if (status) {
    const video = await t.prisma.lessonVideo.create({
      data: {
        lessonId: lesson.id,
        muxUploadId: `up-${lesson.id}`,
        muxAssetId: `asset-${lesson.id}`,
        playbackId: status === 'READY' ? `pb-${lesson.id}` : null,
        status,
        durationSeconds: status === 'READY' ? 120 : null,
      },
    });
    videoId = video.id;
  }
  const content: Prisma.InputJsonValue = {
    videoId,
    status,
    durationSeconds: status === 'READY' ? 120 : null,
    error: null,
    ...(opts.fromLive ? { fromLive: { startsAt: '2026-11-01T11:00:00.000Z', durationMinutes: 60 } } : {}),
  };
  await t.prisma.lesson.update({ where: { id: lesson.id }, data: { content } });
  return { courseId: course.id, lessonId: lesson.id, playbackId: `pb-${lesson.id}` };
}

const buyLesson = (a: Agent, lessonId: string) =>
  a.post(`/purchases/lessons/${lessonId}`).send({ confirmNoRefund: true, expectedCredits: 5 }).expect(201);

function webhook(event: { id: string; type: string; data: Record<string, unknown> }, opts: { now?: Date; signature?: string } = {}) {
  const { body, signature } = t.mux.signedWebhook(event, opts.now);
  return t
    .http()
    .post('/webhooks/mux')
    .set('Content-Type', 'application/json')
    .set('mux-signature', opts.signature ?? signature)
    .send(body);
}

const lessonView = async (agent: Agent, courseId: string, lessonId: string) => {
  const d = (await agent.get(`/teacher/courses/${courseId}`).expect(200)).body;
  return d.sections.flatMap((s: { lessons: unknown[] }) => s.lessons).find((l: { id: string }) => l.id === lessonId);
};

const DEVICE = (n: number) => `device-${String(n).padStart(4, '0')}`;
const playback = (a: Agent, lessonId: string, device = DEVICE(1)) => a.post(`/media/lessons/${lessonId}/playback`).send({ deviceId: device });

// ---------------------------------------------------------------------------

describe('Видео upload + Mux webhook', () => {
  it('direct upload → asset_created → ready webhook-оор боловсруулагдаж, давхардсан/буруу гарын үсэгтэй webhook-ийг үл тооно', async () => {
    const tch = await teacher();
    const { courseId, lessonId } = await draftVideoLesson(tch.agent);
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({
      type: 'VIDEO',
      content: { type: 'VIDEO', status: null },
      problems: ['Видео оруулаагүй'],
    });

    // Бусдын хичээл 404, learner 403.
    const other = await teacher('other@example.mn');
    await other.agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(404);

    const ticket = (await tch.agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(201)).body;
    expect(ticket.url).toMatch(/^https:\/\//);
    expect(t.mux.uploads).toEqual([{ uploadId: 'upload-1', passthrough: ticket.videoId, corsOrigin: 'http://localhost:3000' }]);
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({
      content: { status: 'UPLOADING' },
      problems: ['Видео боловсруулагдаж байна'],
    });
    // Агуулгыг PATCH-аар шууд тавьж болохгүй.
    await tch.agent.patch(`/teacher/lessons/${lessonId}`).send({ content: { status: 'READY' } }).expect(400);

    // Буруу гарын үсэг, хуучирсан timestamp → 400, юу ч хадгалагдахгүй.
    const created = { id: 'evt-1', type: 'video.upload.asset_created', data: { id: 'upload-1', status: 'asset_created', asset_id: 'asset-1' } };
    let res = await webhook(created, { signature: 't=1,v1=deadbeef' });
    expect(res.status).toBe(400);
    res = await webhook(created, { now: new Date(Date.now() - 10 * 60_000) });
    expect(res.status).toBe(400);
    await t.http().post('/webhooks/mux').send({ id: 'x', type: 'video.asset.ready', data: {} }).expect(400);
    expect(await t.prisma.muxWebhookEvent.count()).toBe(0);

    // Хүчинтэй → 200, BullMQ ажил; Mux retry (ижил event id) дахин ажил үүсгэхгүй.
    await webhook(created).expect(200);
    await webhook(created).expect(200);
    expect(t.queue.byName(MUX_WEBHOOK_JOB)).toHaveLength(1);
    await t.queue.drain();
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({ content: { status: 'PROCESSING' } });

    await webhook({
      id: 'evt-2',
      type: 'video.asset.ready',
      data: {
        id: 'asset-1',
        status: 'ready',
        duration: 125.4,
        passthrough: ticket.videoId,
        upload_id: 'upload-1',
        playback_ids: [{ id: 'pb-1', policy: 'signed' }],
      },
    }).expect(200);
    await t.queue.drain();
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({
      content: { type: 'VIDEO', status: 'READY', durationSeconds: 125.4, error: null },
      problems: [],
    });
    const video = await t.prisma.lessonVideo.findUniqueOrThrow({ where: { id: ticket.videoId } });
    expect(video).toMatchObject({ status: 'READY', muxAssetId: 'asset-1', playbackId: 'pb-1' });
    expect((await t.prisma.muxWebhookEvent.findMany()).every((e) => e.processedAt)).toBe(true);

    // Хоцорч ирсэн "errored" READY-г буцаахгүй.
    await webhook({ id: 'evt-3', type: 'video.asset.errored', data: { id: 'asset-1', status: 'errored', passthrough: ticket.videoId } }).expect(200);
    await t.queue.drain();
    expect((await t.prisma.lessonVideo.findUniqueOrThrow({ where: { id: ticket.videoId } })).status).toBe('READY');
  });

  it('дараалал холилдсон (asset.ready эхэлж) ч passthrough-аар олно; алдаа ERRORED; солиход хуучин asset устгагдана', async () => {
    const tch = await teacher();
    const { courseId, lessonId } = await draftVideoLesson(tch.agent);
    const first = (await tch.agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(201)).body;

    await webhook({
      id: 'evt-a',
      type: 'video.asset.errored',
      data: { id: 'asset-a', status: 'errored', passthrough: first.videoId, errors: { type: 'invalid_input', messages: ['Файл уншигдсангүй'] } },
    }).expect(200);
    await t.queue.drain();
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({
      content: { status: 'ERRORED', error: 'Файл уншигдсангүй' },
      problems: ['Видео боловсруулалт амжилтгүй — дахин оруулна уу'],
    });

    // Дахин оруулах: шинэ мөр, хуучин asset-ийг устгах ажил.
    const second = (await tch.agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(201)).body;
    expect(second.videoId).not.toBe(first.videoId);
    await webhook({
      id: 'evt-b',
      type: 'video.asset.ready',
      data: { id: 'asset-b', status: 'ready', duration: 60, passthrough: second.videoId, playback_ids: [{ id: 'pb-b', policy: 'signed' }] },
    }).expect(200);
    // Хуучин видеоны хоцорсон event шинэ видеог дарахгүй.
    await webhook({
      id: 'evt-c',
      type: 'video.asset.ready',
      data: { id: 'asset-a', status: 'ready', duration: 10, passthrough: first.videoId, playback_ids: [{ id: 'pb-a', policy: 'signed' }] },
    }).expect(200);
    await t.queue.drain();
    expect(t.mux.deletedAssets).toEqual(['asset-a']);
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({ content: { status: 'READY', durationSeconds: 60 } });
  });

  it('webhook ирээгүй үед багш Mux API-аас төлөвийг шалгана (sync)', async () => {
    const tch = await teacher();
    const { courseId, lessonId } = await draftVideoLesson(tch.agent);
    const ticket = (await tch.agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(201)).body;
    t.mux.setUpload('upload-1', { status: 'asset_created', assetId: 'asset-s', error: null });
    t.mux.setAsset({
      assetId: 'asset-s',
      status: 'ready',
      playbackId: 'pb-s',
      durationSeconds: 30,
      error: null,
      passthrough: ticket.videoId,
      uploadId: 'upload-1',
    });
    const d = (await tch.agent.post(`/teacher/lessons/${lessonId}/video-sync`).expect(200)).body;
    expect(d.id).toBe(courseId);
    expect(await lessonView(tch.agent, courseId, lessonId)).toMatchObject({ content: { status: 'READY', durationSeconds: 30 } });
  });

  it('нийтлэгдсэн видеог солихгүй; бичлэг болгосон live-д бичлэг бэлэн болтол оруулна; Mux тохируулаагүй бол 503', async () => {
    const tch = await teacher();
    const normal = await publishedVideo(tch.user.id);
    let res = await tch.agent.post(`/teacher/lessons/${normal.lessonId}/video-upload`).expect(409);
    expect(res.body.code).toBe('LESSON_CONTENT_LOCKED');

    const recording = await publishedVideo(tch.user.id, { status: null, fromLive: true });
    await tch.agent.post(`/teacher/lessons/${recording.lessonId}/video-upload`).expect(201);
    const ready = await publishedVideo(tch.user.id, { fromLive: true });
    res = await tch.agent.post(`/teacher/lessons/${ready.lessonId}/video-upload`).expect(409);
    expect(res.body.code).toBe('LESSON_CONTENT_LOCKED');

    t.mux.enabled = false;
    const { lessonId } = await draftVideoLesson(tch.agent);
    res = await tch.agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(503);
    expect(res.body.code).toBe('VIDEO_UNAVAILABLE');
    res = await playback(tch.agent, normal.lessonId).expect(503);
    expect(res.body.code).toBe('VIDEO_UNAVAILABLE');
  });
});

describe('Тоглуулах эрх (signed token)', () => {
  it('эрхгүй хэрэглэгч, зочин token авахгүй; эзэмшигч богино хугацаатай token + watermark + Mux Data metadata авна', async () => {
    const tch = await teacher();
    const v = await publishedVideo(tch.user.id);

    const stranger = await loginByEmail(t, 'stranger@example.mn');
    let res = await playback(stranger.agent, v.lessonId).expect(403);
    expect(res.body.code).toBe('LESSON_LOCKED');
    expect(JSON.stringify(res.body)).not.toContain(v.playbackId);
    res = await t.http().post(`/media/lessons/${v.lessonId}/playback`).send({ deviceId: DEVICE(9) }).expect(403);
    expect(JSON.stringify(res.body)).not.toContain(v.playbackId);
    await stranger.agent.post('/media/lessons/00000000-0000-4000-8000-000000000000/playback').send({ deviceId: DEVICE(1) }).expect(404);

    const buyer = await loginByPhone(t, '99112233');
    await fund(buyer.user.id);
    await buyLesson(buyer.agent, v.lessonId);
    const before = Date.now();
    const grant = (await playback(buyer.agent, v.lessonId).expect(200)).body;
    expect(grant).toMatchObject({
      playbackId: v.playbackId,
      watermark: '9911****',
      heartbeatSeconds: 30,
      muxData: { metadata: { video_id: v.lessonId, video_title: 'Видео хичээл', viewer_user_id: buyer.user.id, video_duration: 120000 } },
    });
    expect(grant.tokens.playback).toMatch(new RegExp(`^fake\\.v\\.${v.playbackId}\\.`));
    expect(grant.tokens.thumbnail).toMatch(/^fake\.t\./);
    expect(grant.tokens.storyboard).toMatch(/^fake\.s\./);
    const ttl = Date.parse(grant.expiresAt) - before;
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 5_000);

    // Имэйлээр нэвтэрсэн эзэмшигч — имэйлийн хэсэг.
    const emailBuyer = await loginByEmail(t, 'bolor@example.mn');
    await fund(emailBuyer.user.id);
    await buyLesson(emailBuyer.agent, v.lessonId);
    expect((await playback(emailBuyer.agent, v.lessonId).expect(200)).body.watermark).toBe('bo***@example.mn');
  });

  it('free preview-д зочин watermark/heartbeat-гүй үзнэ; бэлэн болоогүй видео 409; багш, админ шалгагдаагүй видеог үзнэ', async () => {
    const tch = await teacher();
    const preview = await publishedVideo(tch.user.id, { preview: true });
    const guest = (await t.http().post(`/media/lessons/${preview.lessonId}/playback`).send({ deviceId: DEVICE(1) }).expect(200)).body;
    expect(guest).toMatchObject({ playbackId: preview.playbackId, watermark: null, heartbeatSeconds: null });
    expect(guest.muxData.metadata.viewer_user_id).toBeUndefined();

    const processing = await publishedVideo(tch.user.id, { status: 'PROCESSING', preview: true });
    const res = await t.http().post(`/media/lessons/${processing.lessonId}/playback`).send({ deviceId: DEVICE(1) }).expect(409);
    expect(res.body.code).toBe('VIDEO_NOT_READY');

    const inReview = await publishedVideo(tch.user.id, { reviewStatus: 'IN_REVIEW' });
    await playback(tch.agent, inReview.lessonId).expect(200);
    const adm = await loginByEmail(t, 'admin@example.mn');
    await grantRoleByIdentifier(t.prisma, 'admin@example.mn', 'ADMIN');
    await playback(adm.agent, inReview.lessonId).expect(200);
    const other = await teacher('other@example.mn');
    await playback(other.agent, inReview.lessonId).expect(404);
  });
});

describe('Зэрэг тоглуулалт ≤ 2 төхөөрөмж', () => {
  it('3 дахь төхөөрөмж татгалзана; зогсоох эсвэл heartbeat тасарсны дараа slot чөлөөлөгдөнө', async () => {
    const tch = await teacher();
    const v = await publishedVideo(tch.user.id);
    const buyer = await loginByEmail(t, 'buyer@example.mn');
    await fund(buyer.user.id);
    await buyLesson(buyer.agent, v.lessonId);

    await playback(buyer.agent, v.lessonId, DEVICE(1)).expect(200);
    await playback(buyer.agent, v.lessonId, DEVICE(2)).expect(200);
    // Ижил төхөөрөмж дахин авахад slot нэмэгдэхгүй.
    await playback(buyer.agent, v.lessonId, DEVICE(1)).expect(200);
    let res = await playback(buyer.agent, v.lessonId, DEVICE(3)).expect(409);
    expect(res.body.code).toBe('PLAYBACK_LIMIT');
    expect(res.body.tokens).toBeUndefined();
    // Өөр хэрэглэгчид нөлөөлөхгүй.
    const other = await loginByEmail(t, 'other-buyer@example.mn');
    await fund(other.user.id);
    await buyLesson(other.agent, v.lessonId);
    await playback(other.agent, v.lessonId, DEVICE(3)).expect(200);

    // Heartbeat: идэвхтэй төхөөрөмж сунгана, slot-гүй 3 дахь нь 409. Heartbeat нэвтрэлт шаардана.
    await buyer.agent.post('/media/playback/heartbeat').send({ deviceId: DEVICE(1) }).expect(204);
    res = await buyer.agent.post('/media/playback/heartbeat').send({ deviceId: DEVICE(3) }).expect(409);
    expect(res.body.code).toBe('PLAYBACK_LIMIT');
    await t.http().post('/media/playback/heartbeat').send({ deviceId: DEVICE(1) }).expect(401);

    // Зогсоосон төхөөрөмжийн slot шууд чөлөөлөгдөнө.
    await buyer.agent.post('/media/playback/stop').send({ deviceId: DEVICE(2) }).expect(204);
    await playback(buyer.agent, v.lessonId, DEVICE(3)).expect(200);
    await playback(buyer.agent, v.lessonId, DEVICE(4)).expect(409);

    // Heartbeat тасарвал (TTL) slot өөрөө чөлөөлөгдөнө; хуучин төхөөрөмж буцаж ирэхэд хязгаар хэвээр.
    t.playback.advance((PLAYBACK_SESSION_TTL_SECONDS - 10) * 1000);
    await buyer.agent.post('/media/playback/heartbeat').send({ deviceId: DEVICE(1) }).expect(204);
    t.playback.advance(20 * 1000);
    await playback(buyer.agent, v.lessonId, DEVICE(4)).expect(200);
    res = await buyer.agent.post('/media/playback/heartbeat').send({ deviceId: DEVICE(3) }).expect(409);
    expect(res.body.code).toBe('PLAYBACK_LIMIT');
  });
});
