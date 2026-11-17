import { grantRoleByIdentifier } from '../src/admin/roles';
import { MUX_ORPHAN_CLEANUP_JOB, MUX_ORPHAN_MAX_ATTEMPTS } from '../src/media/mux-orphans.service';
import { createTestApp, loginByEmail, type TestApp } from './harness';

jest.setTimeout(180_000);

/**
 * Ticket 10 үлдэгдэл: DRAFT lesson / курс бүрмөсөн устахад Mux дээрх asset үлдэхгүй.
 * `lesson_videos` устахад DB trigger `mux_orphans`-д бичнэ, `mux.orphan-cleanup` cron Mux-аас цэвэрлэнэ.
 */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Agent = Awaited<ReturnType<typeof loginByEmail>>['agent'];

async function teacher(email = 'teacher@example.mn') {
  const s = await loginByEmail(t, email);
  await grantRoleByIdentifier(t.prisma, email, 'TEACHER');
  return s;
}

async function draftVideoLesson(agent: Agent, courseId?: string) {
  const cid = courseId ?? (await agent.post('/teacher/courses').send({ title: 'Видео курс' }).expect(201)).body.id;
  const d = (await agent.post(`/teacher/courses/${cid}/sections`).send({ title: 'Хэсэг' }).expect(201)).body;
  const section = d.sections[d.sections.length - 1];
  const after = (await agent.post(`/teacher/sections/${section.id}/lessons`).send({ title: 'Видео', type: 'VIDEO' }).expect(201)).body;
  const lessons = after.sections.flatMap((s: { lessons: { id: string }[] }) => s.lessons);
  return { courseId: cid as string, lessonId: lessons[lessons.length - 1].id as string };
}

/** Upload хийж, Mux upload-ыг `asset_created` + DB-д asset id-тай болгоно (webhook ирсэн мэт). */
async function uploadWithAsset(agent: Agent, lessonId: string, assetId: string) {
  const ticket = (await agent.post(`/teacher/lessons/${lessonId}/video-upload`).expect(201)).body;
  const video = await t.prisma.lessonVideo.update({
    where: { id: ticket.videoId },
    data: { muxAssetId: assetId, status: 'PROCESSING' },
  });
  t.mux.setUpload(video.muxUploadId, { status: 'asset_created', assetId, error: null });
  return video;
}

const cleanup = () => t.queue.runScheduled(MUX_ORPHAN_CLEANUP_JOB);

describe('Устгагдсан видеоны Mux asset цэвэрлэгээ', () => {
  it('DRAFT lesson устгахад asset-ийг cron устгана; давтан ажиллахад юу ч хийхгүй; архивласан lesson-ы видеонд хүрэхгүй', async () => {
    const tch = await teacher();
    const { courseId, lessonId } = await draftVideoLesson(tch.agent);
    const video = await uploadWithAsset(tch.agent, lessonId, 'asset-draft');

    // Өөр (үлдэх) lesson-ы видео хөндөгдөхгүй.
    const keep = await draftVideoLesson(tch.agent, courseId);
    await uploadWithAsset(tch.agent, keep.lessonId, 'asset-keep');

    await tch.agent.delete(`/teacher/lessons/${lessonId}`).expect(200);
    expect(await t.prisma.lessonVideo.findUnique({ where: { id: video.id } })).toBeNull();
    expect(await t.prisma.muxOrphan.findMany()).toEqual([
      expect.objectContaining({ videoId: video.id, muxUploadId: video.muxUploadId, muxAssetId: 'asset-draft', attempts: 0 }),
    ]);
    // Устгах үед Mux руу шууд дуудахгүй — catalog media-г мэдэхгүй.
    expect(t.mux.deletedAssets).toEqual([]);

    expect(t.queue.schedules.get(MUX_ORPHAN_CLEANUP_JOB)).toBeDefined();
    await cleanup();
    expect(t.mux.deletedAssets).toEqual(['asset-draft']);
    expect(await t.prisma.muxOrphan.count()).toBe(0);

    await cleanup();
    expect(t.mux.deletedAssets).toEqual(['asset-draft']);
    expect(await t.prisma.lessonVideo.count()).toBe(1);
  });

  it('DRAFT курс устгахад бүх видеоны asset цэвэрлэгдэнэ (cascade)', async () => {
    const tch = await teacher();
    const a = await draftVideoLesson(tch.agent);
    const b = await draftVideoLesson(tch.agent, a.courseId);
    await uploadWithAsset(tch.agent, a.lessonId, 'asset-a');
    await uploadWithAsset(tch.agent, b.lessonId, 'asset-b');

    await tch.agent.delete(`/teacher/courses/${a.courseId}`).expect(204);
    expect(await t.prisma.muxOrphan.count()).toBe(2);
    await cleanup();
    expect([...t.mux.deletedAssets].sort()).toEqual(['asset-a', 'asset-b']);
    expect(await t.prisma.muxOrphan.count()).toBe(0);
  });

  it('asset id-гүй (webhook ирээгүй) видео: Mux-аас upload-ыг асууж asset-ийг устгана, хүлээгдэж буй upload-ыг цуцална', async () => {
    const tch = await teacher();
    const created = await draftVideoLesson(tch.agent);
    const waiting = await draftVideoLesson(tch.agent, created.courseId);
    const t1 = (await tch.agent.post(`/teacher/lessons/${created.lessonId}/video-upload`).expect(201)).body;
    const t2 = (await tch.agent.post(`/teacher/lessons/${waiting.lessonId}/video-upload`).expect(201)).body;
    const v1 = await t.prisma.lessonVideo.findUniqueOrThrow({ where: { id: t1.videoId } });
    const v2 = await t.prisma.lessonVideo.findUniqueOrThrow({ where: { id: t2.videoId } });
    // Эхнийх нь Mux дээр asset болсон ч webhook ирээгүй; хоёр дахь нь browser upload дуусаагүй.
    t.mux.setUpload(v1.muxUploadId, { status: 'asset_created', assetId: 'asset-late', error: null });

    await tch.agent.delete(`/teacher/lessons/${created.lessonId}`).expect(200);
    await tch.agent.delete(`/teacher/lessons/${waiting.lessonId}`).expect(200);
    expect(await t.prisma.muxOrphan.findMany({ orderBy: { muxUploadId: 'asc' } })).toEqual([
      expect.objectContaining({ muxUploadId: v1.muxUploadId, muxAssetId: null }),
      expect.objectContaining({ muxUploadId: v2.muxUploadId, muxAssetId: null }),
    ]);

    await cleanup();
    expect(t.mux.deletedAssets).toEqual(['asset-late']);
    expect(t.mux.cancelledUploads).toEqual([v2.muxUploadId]);
    expect(await t.prisma.muxOrphan.count()).toBe(0);
  });

  it('Mux түр алдаа: мөр үлдэж дараагийн ажиллагаанд дахин оролдоно; Mux тохируулаагүй бол хүлээнэ; хэт олон алдаа → орхино', async () => {
    const tch = await teacher();
    const { lessonId } = await draftVideoLesson(tch.agent);
    await uploadWithAsset(tch.agent, lessonId, 'asset-flaky');
    await tch.agent.delete(`/teacher/lessons/${lessonId}`).expect(200);

    t.mux.failures = 1;
    await cleanup();
    expect(t.mux.deletedAssets).toEqual([]);
    expect(await t.prisma.muxOrphan.findFirstOrThrow()).toMatchObject({ attempts: 1, lastError: expect.stringContaining('asset-flaky') });

    // Mux идэвхгүй (dev) — юу ч хийхгүй, мөр хадгалагдана.
    t.mux.enabled = false;
    await cleanup();
    expect(await t.prisma.muxOrphan.findFirstOrThrow()).toMatchObject({ attempts: 1 });
    t.mux.enabled = true;

    await cleanup();
    expect(t.mux.deletedAssets).toEqual(['asset-flaky']);
    expect(await t.prisma.muxOrphan.count()).toBe(0);

    // Байнга бүтэлгүйтэх (жишээ нь Mux дээр upload олдохгүй) мөр — дээд оролдлогын дараа орхигдоно.
    await t.prisma.muxOrphan.create({
      data: { videoId: '00000000-0000-4000-8000-000000000001', muxUploadId: 'upload-unknown', attempts: MUX_ORPHAN_MAX_ATTEMPTS - 2 },
    });
    await cleanup();
    expect(await t.prisma.muxOrphan.findFirstOrThrow()).toMatchObject({ attempts: MUX_ORPHAN_MAX_ATTEMPTS - 1 });
    await cleanup();
    expect(await t.prisma.muxOrphan.count()).toBe(0);
  });
});
