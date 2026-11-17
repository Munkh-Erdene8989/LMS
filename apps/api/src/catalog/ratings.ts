import { Prisma } from '@lms/db';
import type { CourseRating } from '@lms/shared';
import type { Db } from '../purchases/entitlements';

/**
 * Курсийн үнэлгээ — каталогийн шүүлтүүр/эрэмбэ болон картанд хэрэглэгдэх ЦОРЫН ГАНЦ эх үүсвэр (ticket 18).
 *
 * Дундаж = нуугдаагүй (`hidden_at IS NULL`) review-уудын `rating`-ийн дундаж, нэг оронгийн нарийвчлалтай.
 * Review-гүй курс `{ average: null, count: 0 }`: `minRating` шүүлтүүрт орохгүй, `rating` эрэмбэд сүүлд.
 * SQL (шүүлтүүр) болон `loadRatings` (карт) ижил бүхэлчлэлтэй — "4.0 од" гэж харагдсан курс `minRating=4`-д орно.
 */

/**
 * `LEFT JOIN LATERAL (...) rating ON true` — `rating.avg` (float8 | null), `rating.cnt` (int) баганатай.
 * Гаднах query-д курс `c` alias-тай байх ёстой.
 */
export const RATING_LATERAL = Prisma.sql`LEFT JOIN LATERAL (
  SELECT round(avg(r.rating), 1)::float8 AS avg, count(*)::int AS cnt
  FROM reviews r
  WHERE r.course_id = c.id AND r.hidden_at IS NULL
) rating ON true`;

export async function loadRatings(db: Db, courseIds: string[]): Promise<Map<string, CourseRating>> {
  if (courseIds.length === 0) return new Map();
  // `RATING_LATERAL`-тай ИЖИЛ SQL бүхэлчлэл — JS float бүхэлчлэл (жишээ нь 4.35) шүүлтүүрээс зөрөхгүй.
  const rows = await db.$queryRaw<{ course_id: string; avg: number; cnt: number }[]>`
    SELECT r.course_id::text AS course_id, round(avg(r.rating), 1)::float8 AS avg, count(*)::int AS cnt
    FROM reviews r
    WHERE r.course_id = ANY(${courseIds}::uuid[]) AND r.hidden_at IS NULL
    GROUP BY r.course_id`;
  return new Map(rows.map((r) => [r.course_id, { average: r.avg, count: r.cnt }]));
}

export const NO_RATING: CourseRating = { average: null, count: 0 };
