import type { LessonProgress } from '@lms/db';
import type { LessonProgressView } from '@lms/shared';
import type { Db } from '../purchases/entitlements';

export interface ProgressPatch {
  watchedPercent?: number;
  bestScorePercent?: number;
  complete?: boolean;
}

/**
 * Явцын мөрийг үүсгэх/шинэчлэх (quiz, видео, текст/PDF, даалгавар бүгд үүгээр). Утгууд зөвхөн өсөх тул
 * нөхцөлтэй `updateMany` (атомар) — зэрэг ирсэн хүсэлтүүд бие биенийхээ үр дүнг бууруулахгүй.
 */
export async function bumpProgress(
  db: Db,
  userId: string,
  lesson: { id: string; courseId: string },
  patch: ProgressPatch,
): Promise<LessonProgress> {
  const now = new Date();
  const where = { userId_lessonId: { userId, lessonId: lesson.id } };
  let row = await db.lessonProgress.upsert({
    where,
    create: {
      userId,
      lessonId: lesson.id,
      courseId: lesson.courseId,
      watchedPercent: patch.watchedPercent ?? 0,
      bestScorePercent: patch.bestScorePercent ?? null,
      completedAt: patch.complete ? now : null,
      lastViewedAt: now,
    },
    update: { lastViewedAt: now },
  });

  const updates: Promise<unknown>[] = [];
  const w = patch.watchedPercent;
  if (w !== undefined && row.watchedPercent < w) {
    updates.push(db.lessonProgress.updateMany({ where: { id: row.id, watchedPercent: { lt: w } }, data: { watchedPercent: w } }));
  }
  const s = patch.bestScorePercent;
  if (s !== undefined && (row.bestScorePercent === null || row.bestScorePercent < s)) {
    updates.push(
      db.lessonProgress.updateMany({
        where: { id: row.id, OR: [{ bestScorePercent: null }, { bestScorePercent: { lt: s } }] },
        data: { bestScorePercent: s },
      }),
    );
  }
  if (patch.complete && !row.completedAt) {
    updates.push(db.lessonProgress.updateMany({ where: { id: row.id, completedAt: null }, data: { completedAt: now } }));
  }
  if (updates.length) {
    await Promise.all(updates);
    row = await db.lessonProgress.findUniqueOrThrow({ where });
  }
  return row;
}

export function progressView(r: LessonProgress): LessonProgressView {
  return {
    lessonId: r.lessonId,
    completed: !!r.completedAt,
    completedAt: r.completedAt?.toISOString() ?? null,
    watchedPercent: r.watchedPercent,
    bestScorePercent: r.bestScorePercent,
    lastViewedAt: r.lastViewedAt.toISOString(),
  };
}
