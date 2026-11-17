import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@lms/db';
import {
  ANALYTICS_MAX_DAYS,
  ANALYTICS_MAX_MONTHS,
  addDays,
  analyticsPeriods,
  ubLocalToIso,
  ubToday,
  type AnalyticsGranularity,
  type CourseAnalyticsRow,
  type CourseVideoAnalyticsView,
  type DropOffBucket,
  type LessonSalesRow,
  type LessonVideoAnalytics,
  type SalesTotals,
  type TeacherAnalyticsView,
  type VideoDataStatus,
} from '@lms/shared';
import { MUX, type MuxAdapter, type MuxVideoEngagement } from '../adapters/mux';
import { ApiError } from '../auth/errors';
import { CatalogErrors } from '../catalog/errors';
import type { VideoContent } from '../catalog/lesson-types';
import { CERTIFICATE_LESSON_TYPES } from '../learning/certificates.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherEarningsService } from '../purchases/earnings.service';

export interface RangeQuery {
  from?: string;
  to?: string;
  granularity: AnalyticsGranularity;
}

/** Шийдсэн хүрээ: UB огноо + UTC хил [fromUtc, toUtc) */
interface Range {
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
  fromUtc: Date;
  toUtc: Date;
}

const invalidRange = (message: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_RANGE', message);

/** UB-ийн `YYYY-MM-DD` 00:00 → UTC агшин */
function ubMidnight(date: string): Date {
  return new Date(ubLocalToIso(`${date}T00:00`)!);
}

function lastDayOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Хүрээг шийднэ. Анхдагч: өдрөөр — сүүлийн 30 хоног, сараар — сүүлийн 12 сар (энэ сарыг оруулаад).
 * Сараар үед from/to-г сарын эхэн/төгсгөл рүү тэлнэ.
 */
export function resolveRange(q: RangeQuery, now = new Date()): Range {
  const today = ubToday(now);
  let to = q.to ?? today;
  let from: string;
  if (q.granularity === 'day') {
    from = q.from ?? addDays(to, -29);
  } else {
    const [y, m] = to.split('-').map(Number) as [number, number];
    const start = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 10);
    from = (q.from ?? start).slice(0, 8) + '01';
    to = lastDayOfMonth(to);
  }
  if (from > to) throw invalidRange('Эхлэх огноо дуусах огнооноос хойш байна.');
  const periods = analyticsPeriods(from, to, q.granularity).length;
  if (q.granularity === 'day' && periods > ANALYTICS_MAX_DAYS) {
    throw invalidRange(`Өдрөөр харахад хамгийн ихдээ ${ANALYTICS_MAX_DAYS} хоног.`);
  }
  if (q.granularity === 'month' && periods > ANALYTICS_MAX_MONTHS) {
    throw invalidRange(`Сараар харахад хамгийн ихдээ ${ANALYTICS_MAX_MONTHS} сар.`);
  }
  return { from, to, granularity: q.granularity, fromUtc: ubMidnight(from), toUtc: ubMidnight(addDays(to, 1)) };
}

/** `timestamp(3)` (UTC) баганыг Улаанбаатарын local цаг руу */
const UB_CREATED_AT = Prisma.sql`((p.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ulaanbaatar')`;

/** `timestamp` (tz-гүй, UTC) параметр */
const ts = (d: Date) => Prisma.sql`${d.toISOString().replace('Z', '')}::timestamp`;

interface SalesRow {
  g_period: number;
  g_attr: number;
  g_course: number;
  g_lesson: number;
  period: string | null;
  attribution: 'PLATFORM' | 'REFERRAL' | null;
  course_id: string | null;
  kind: 'LESSON' | 'COURSE' | null;
  lesson_id: string | null;
  sales: number;
  credits: bigint;
  gross: bigint;
  earning: bigint;
}

const zero = (): SalesTotals => ({ sales: 0, credits: 0, grossMnt: 0, earningMnt: 0 });
const totalsOf = (r: SalesRow): SalesTotals => ({
  sales: r.sales,
  credits: Number(r.credits),
  grossMnt: Number(r.gross),
  earningMnt: Number(r.earning),
});
const addTo = (a: SalesTotals, b: SalesTotals) => {
  a.sales += b.sales;
  a.credits += b.credits;
  a.grossMnt += b.grossMnt;
  a.earningMnt += b.earningMnt;
};

/** Drop-off-ын 10 алхам: 0–9, 10–19, …, 90–100 */
const BUCKETS = 10;

/**
 * Багшийн аналитик (ticket 21). Борлуулалт — `purchases` (`teacher_id` = худалдах үеийн багш, тест бус),
 * орлого — `teacher_earning_entries.SALE_EARNING`, дуусгалт ба drop-off — `lesson_progress`, видео үзэлт —
 * Mux Data. Бүх асуулга `teacher_id`-аар шүүгдэнэ — багш зөвхөн өөрийн өгөгдлийг харна.
 */
@Injectable()
export class AnalyticsService {
  private readonly log = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly earnings: TeacherEarningsService,
    @Inject(MUX) private readonly mux: MuxAdapter,
  ) {}

  async overview(teacherId: string, q: RangeQuery, now = new Date()): Promise<TeacherAnalyticsView> {
    const range = resolveRange(q, now);
    const fmt = range.granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const inRange = Prisma.sql`p.teacher_id = ${teacherId}::uuid AND p.created_at >= ${ts(range.fromUtc)} AND p.created_at < ${ts(range.toUtc)}`;

    const [rows, test, courses, lessons, completion, balanceMnt] = await Promise.all([
      // Нэг асуулгаар 4 задаргаа (GROUPING SETS): үе, attribution, курс×төрөл, lesson
      this.prisma.$queryRaw<SalesRow[]>`
        WITH s AS (
          SELECT to_char(${UB_CREATED_AT}, ${Prisma.raw(`'${fmt}'`)}) AS period, p.attribution, p.course_id, p.kind,
                 p.lesson_id, p.credits, p.credit_price_mnt, e.amount_mnt
          FROM purchases p
          LEFT JOIN teacher_earning_entries e ON e.purchase_id = p.id AND e.type = 'SALE_EARNING'
          WHERE ${inRange} AND p.is_test = false
        )
        SELECT GROUPING(period)::int AS g_period,
               GROUPING(attribution)::int AS g_attr,
               GROUPING(course_id, kind)::int AS g_course,
               GROUPING(lesson_id)::int AS g_lesson,
               period,
               attribution::text AS attribution,
               course_id::text AS course_id,
               kind::text AS kind,
               lesson_id::text AS lesson_id,
               count(*)::int AS sales,
               coalesce(sum(credits), 0)::bigint AS credits,
               coalesce(sum(credits::bigint * credit_price_mnt), 0)::bigint AS gross,
               coalesce(sum(amount_mnt), 0)::bigint AS earning
        FROM s
        GROUP BY GROUPING SETS ((period), (attribution), (course_id, kind), (lesson_id))`,
      this.prisma.$queryRaw<{ sales: number; credits: bigint }[]>`
        SELECT count(*)::int AS sales, coalesce(sum(p.credits), 0)::bigint AS credits
        FROM purchases p WHERE ${inRange} AND p.is_test = true`,
      this.prisma.course.findMany({
        where: { teacherId },
        select: { id: true, title: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.lesson.findMany({
        where: { course: { teacherId } },
        select: { id: true, courseId: true, title: true, reviewStatus: true, archivedAt: true, position: true },
        orderBy: [{ courseId: 'asc' }, { position: 'asc' }],
      }),
      this.completion(teacherId),
      this.earnings.balance(teacherId),
    ]);

    const series = new Map(analyticsPeriods(range.from, range.to, range.granularity).map((p) => [p, zero()]));
    const attribution = { REFERRAL: zero(), PLATFORM: zero() };
    const totals = zero();
    const byCourse = new Map<string, { courseSales: number; lessonSales: number; t: SalesTotals }>();
    const byLesson = new Map<string, SalesTotals>();

    for (const r of rows) {
      const v = totalsOf(r);
      if (r.g_period === 0 && r.period) {
        const p = series.get(r.period);
        if (p) addTo(p, v);
        addTo(totals, v);
      } else if (r.g_attr === 0 && r.attribution) {
        addTo(attribution[r.attribution], v);
      } else if (r.g_course === 0 && r.course_id) {
        const c = byCourse.get(r.course_id) ?? { courseSales: 0, lessonSales: 0, t: zero() };
        if (r.kind === 'COURSE') c.courseSales += r.sales;
        else c.lessonSales += r.sales;
        addTo(c.t, v);
        byCourse.set(r.course_id, c);
      } else if (r.g_lesson === 0 && r.lesson_id) {
        byLesson.set(r.lesson_id, v);
      }
    }

    const courseRows: CourseAnalyticsRow[] = courses.map((c) => {
      const s = byCourse.get(c.id);
      const done = completion.get(c.id) ?? { learners: 0, completed: 0 };
      return {
        courseId: c.id,
        title: c.title,
        courseSales: s?.courseSales ?? 0,
        lessonSales: s?.lessonSales ?? 0,
        credits: s?.t.credits ?? 0,
        earningMnt: s?.t.earningMnt ?? 0,
        learners: done.learners,
        completedLearners: done.completed,
        completionPercent: done.learners ? Math.floor((done.completed * 100) / done.learners) : null,
      };
    });

    const lessonRows: LessonSalesRow[] = lessons
      .filter((l) => l.reviewStatus === 'APPROVED' || byLesson.has(l.id))
      .map((l) => {
        const s = byLesson.get(l.id) ?? zero();
        return {
          lessonId: l.id,
          courseId: l.courseId,
          title: l.title,
          archived: l.archivedAt !== null,
          sales: s.sales,
          credits: s.credits,
          earningMnt: s.earningMnt,
        };
      });

    return {
      range: { from: range.from, to: range.to, granularity: range.granularity, timezone: 'Asia/Ulaanbaatar' },
      totals,
      series: [...series].map(([period, v]) => ({ period, ...v })),
      attribution,
      testSales: { sales: test[0]?.sales ?? 0, credits: Number(test[0]?.credits ?? 0) },
      courses: courseRows,
      lessons: lessonRows,
      balanceMnt,
    };
  }

  /**
   * Курс бүрийн дуусгалт: суралцагч = тест бус худалдан авалтаар ядаж нэг lesson (эсвэл бүтэн курс)
   * эзэмшдэг; дууссан = курсийн одоогийн бүх идэвхтэй (зөвшөөрөгдсөн, архивлаагүй, сертификатад тооцогдох
   * төрлийн) lesson-д `completed_at`-тай. Сертификатын нөхцөлтэй ижил lesson-ууд.
   */
  private async completion(teacherId: string): Promise<Map<string, { learners: number; completed: number }>> {
    const types = Prisma.join([...CERTIFICATE_LESSON_TYPES]);
    const rows = await this.prisma.$queryRaw<{ course_id: string; learners: number; completed: number }[]>`
      WITH active AS (
        SELECT l.id, l.course_id FROM lessons l JOIN courses c ON c.id = l.course_id
        WHERE c.teacher_id = ${teacherId}::uuid AND l.review_status = 'APPROVED' AND l.archived_at IS NULL
          AND l.type::text IN (${types})
      ),
      lesson_counts AS (SELECT course_id, count(*)::int AS n FROM active GROUP BY course_id),
      learners AS (
        SELECT e.course_id, e.user_id FROM entitlements e
          JOIN purchases p ON p.id = e.purchase_id
        WHERE p.teacher_id = ${teacherId}::uuid AND p.is_test = false
        UNION
        SELECT ce.course_id, ce.user_id FROM course_entitlements ce
          JOIN purchases p ON p.id = ce.purchase_id
        WHERE p.teacher_id = ${teacherId}::uuid AND p.is_test = false
      ),
      done AS (
        SELECT lp.course_id, lp.user_id, count(*)::int AS n FROM lesson_progress lp
          JOIN active a ON a.id = lp.lesson_id
        WHERE lp.completed_at IS NOT NULL GROUP BY lp.course_id, lp.user_id
      )
      SELECT le.course_id::text AS course_id, count(*)::int AS learners,
             (count(*) FILTER (WHERE lc.n > 0 AND d.n = lc.n))::int AS completed
      FROM learners le
        JOIN courses c ON c.id = le.course_id AND c.teacher_id = ${teacherId}::uuid
        LEFT JOIN lesson_counts lc ON lc.course_id = le.course_id
        LEFT JOIN done d ON d.course_id = le.course_id AND d.user_id = le.user_id
      GROUP BY le.course_id`;
    return new Map(rows.map((r) => [r.course_id, { learners: r.learners, completed: r.completed }]));
  }

  /**
   * Курсийн видео lesson бүрийн үзэлт (Mux Data, хүрээнд) ба зогсдог цэг (`lesson_progress.watched_percent` —
   * суралцагчийн хүрсэн хамгийн хол байрлал, бүх хугацаанд). Mux түлхүүргүй/алдаатай бол үзэлт null.
   */
  async courseVideo(teacherId: string, courseId: string, q: RangeQuery, now = new Date()): Promise<CourseVideoAnalyticsView> {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, teacherId }, select: { id: true } });
    if (!course) throw CatalogErrors.courseNotFound();
    const range = resolveRange({ ...q, granularity: 'day' }, now);

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, type: 'VIDEO', reviewStatus: 'APPROVED' },
      select: { id: true, title: true, content: true, archivedAt: true },
      orderBy: [{ position: 'asc' }],
    });
    const ids = lessons.map((l) => l.id);

    const [progress, mux] = await Promise.all([
      ids.length
        ? this.prisma.$queryRaw<{ lesson_id: string; bucket: number; completed: boolean; n: number }[]>`
            SELECT lp.lesson_id::text AS lesson_id,
                   least(lp.watched_percent / 10, ${BUCKETS - 1})::int AS bucket,
                   (lp.completed_at IS NOT NULL) AS completed,
                   count(*)::int AS n
            FROM lesson_progress lp
            WHERE lp.lesson_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
              AND lp.user_id <> ${teacherId}::uuid
            GROUP BY 1, 2, 3`
        : Promise.resolve([]),
      this.muxEngagement(courseId, range, now),
    ]);

    const views = new Map(mux.rows.map((r) => [r.videoId, r]));
    return {
      courseId,
      range: { from: range.from, to: range.to },
      mux: mux.status,
      lessons: lessons.map((l): LessonVideoAnalytics => {
        const dropOff: DropOffBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({ fromPercent: i * 10, learners: 0 }));
        let learners = 0;
        let completed = 0;
        for (const p of progress) {
          if (p.lesson_id !== l.id) continue;
          dropOff[p.bucket]!.learners += p.n;
          learners += p.n;
          if (p.completed) completed += p.n;
        }
        const v = mux.status === 'OK' ? (views.get(l.id) ?? { views: 0, watchTimeMs: 0 }) : null;
        return {
          lessonId: l.id,
          title: l.title,
          durationSeconds: (l.content as unknown as VideoContent).durationSeconds ?? null,
          views: v ? v.views : null,
          watchTimeSeconds: v ? Math.round(v.watchTimeMs / 1000) : null,
          avgWatchSecondsPerView: v ? (v.views ? Math.round(v.watchTimeMs / 1000 / v.views) : 0) : null,
          learners,
          completedLearners: completed,
          dropOff,
        };
      }),
    };
  }

  private async muxEngagement(
    courseId: string,
    range: Range,
    now: Date,
  ): Promise<{ status: VideoDataStatus; rows: MuxVideoEngagement[] }> {
    if (!this.mux.enabled) return { status: 'NOT_CONFIGURED', rows: [] };
    try {
      const to = range.toUtc.getTime() > now.getTime() ? now : range.toUtc;
      const rows = await this.mux.videoEngagement({ subPropertyId: courseId, from: range.fromUtc, to });
      return { status: 'OK', rows };
    } catch (err) {
      this.log.warn(`Mux Data алдаа (course ${courseId}): ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'UNAVAILABLE', rows: [] };
    }
  }
}
