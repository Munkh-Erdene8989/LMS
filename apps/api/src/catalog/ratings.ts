import { Prisma } from '@lms/db';
import type { CourseRating } from '@lms/shared';

/**
 * Курсийн үнэлгээ — каталогийн шүүлтүүр/эрэмбэ болон картанд хэрэглэгдэх ЦОРЫН ГАНЦ эх үүсвэр.
 *
 * Review-ууд ticket 18-д нэмэгдэнэ. Одоогоор бүх курс `{ average: null, count: 0 }`:
 * `minRating` шүүлтүүр юу ч олохгүй, `rating` эрэмбэ `newest`-тэй адил ажиллана.
 * Ticket 18: доорх хоёрыг review хүснэгтийн aggregate-аар солино (жишээ нь
 * `SELECT avg(r.rating)::float8, count(*)::int FROM reviews r WHERE r.course_id = c.id AND r.hidden_at IS NULL`).
 */

/**
 * `LEFT JOIN LATERAL (...) rating ON true` — `rating.avg` (float8 | null), `rating.cnt` (int) баганатай.
 * Гаднах query-д курс `c` alias-тай байх ёстой.
 */
export const RATING_LATERAL = Prisma.sql`LEFT JOIN LATERAL (SELECT NULL::float8 AS avg, 0::int AS cnt) rating ON true`;

export async function loadRatings(_courseIds: string[]): Promise<Map<string, CourseRating>> {
  return new Map();
}

export const NO_RATING: CourseRating = { average: null, count: 0 };
