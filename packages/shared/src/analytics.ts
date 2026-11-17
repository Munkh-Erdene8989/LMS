/**
 * Багшийн аналитик (ticket 21). Бүх огноо Улаанбаатарын цагаар (UTC+08:00, зуны цаггүй).
 * Борлуулалтын тоонд тест гүйлгээ (`purchases.is_test`) орохгүй — тусад нь `testSales`-д.
 */
export type AnalyticsGranularity = 'day' | 'month';

/** Өдрийн хүрээ хамгийн ихдээ (өдөр) */
export const ANALYTICS_MAX_DAYS = 366;
/** Сарын хүрээ хамгийн ихдээ (сар) */
export const ANALYTICS_MAX_MONTHS = 36;

export interface SalesTotals {
  /** Худалдан авалтын тоо */
  sales: number;
  /** Зарцуулсан кредит */
  credits: number;
  /** credits × худалдах үеийн кредитийн ₮ үнэ */
  grossMnt: number;
  /** Багшид бичигдсэн орлого (шимтгэлийн дараа) */
  earningMnt: number;
}

export interface SalesPoint extends SalesTotals {
  /** `YYYY-MM-DD` (өдөр) эсвэл `YYYY-MM` (сар), Улаанбаатарын цагаар */
  period: string;
}

export interface LessonSalesRow {
  lessonId: string;
  courseId: string;
  title: string;
  archived: boolean;
  /** Хүрээн дэх lesson-ий ширхэгийн худалдан авалт */
  sales: number;
  credits: number;
  earningMnt: number;
}

export interface CourseAnalyticsRow {
  courseId: string;
  title: string;
  /** Хүрээн дэх бүтэн курсийн худалдан авалт */
  courseSales: number;
  /** Хүрээн дэх lesson-ий худалдан авалт */
  lessonSales: number;
  credits: number;
  earningMnt: number;
  /** Дуусгалт (хүрээнээс үл хамаарна): курсээс ядаж нэг lesson эзэмшдэг суралцагч */
  learners: number;
  /** Курсийн бүх идэвхтэй (VIDEO/TEXT/PDF/QUIZ) lesson-ыг дуусгасан суралцагч */
  completedLearners: number;
  /** completedLearners / learners × 100 (бүхэл, доош); суралцагчгүй бол null */
  completionPercent: number | null;
}

/** `GET /teacher/analytics?from&to&granularity` */
export interface TeacherAnalyticsView {
  range: { from: string; to: string; granularity: AnalyticsGranularity; timezone: 'Asia/Ulaanbaatar' };
  totals: SalesTotals;
  /** Хүрээн дэх бүх үе (борлуулалтгүй үе 0) */
  series: SalesPoint[];
  attribution: { REFERRAL: SalesTotals; PLATFORM: SalesTotals };
  /** Тест гүйлгээ — дээрх тоонд ороогүй */
  testSales: { sales: number; credits: number };
  courses: CourseAnalyticsRow[];
  lessons: LessonSalesRow[];
  /** Payout хийх боломжтой орлогын үлдэгдэл (`/teacher/earnings`-тэй ижил) */
  balanceMnt: number;
}

export type VideoDataStatus = 'OK' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

/** Зогсдог цэг: суралцагчийн хүрсэн хамгийн хол байрлал (`lesson_progress.watched_percent`) 10%-ийн алхмаар */
export interface DropOffBucket {
  /** 0, 10, …, 90 — [from, from+10) (90 нь 100-г оруулна) */
  fromPercent: number;
  learners: number;
}

export interface LessonVideoAnalytics {
  lessonId: string;
  title: string;
  durationSeconds: number | null;
  /** Mux Data — хүрээн дэх үзэлт; Mux боломжгүй бол null */
  views: number | null;
  /** Mux Data — нийт үзсэн хугацаа (сек) */
  watchTimeSeconds: number | null;
  /** Нэг үзэлтийн дундаж (сек) */
  avgWatchSecondsPerView: number | null;
  /** Үзэж эхэлсэн суралцагч (lesson_progress) */
  learners: number;
  /** ≥ 90% хүрсэн (дууссан) суралцагч */
  completedLearners: number;
  dropOff: DropOffBucket[];
}

/** `GET /teacher/analytics/courses/:id/video?from&to` */
export interface CourseVideoAnalyticsView {
  courseId: string;
  range: { from: string; to: string };
  /** Mux Data-ийн төлөв: түлхүүргүй эсвэл алдаа гарвал үзэлт/хугацаа null, drop-off хэвээр */
  mux: VideoDataStatus;
  lessons: LessonVideoAnalytics[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` хүчинтэй эсэх */
export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** `YYYY-MM-DD` + n өдөр */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Одоогийн Улаанбаатарын огноо `YYYY-MM-DD` */
export function ubToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}

/** from..to (хоёулаа орно) хүрээн дэх үеүдийн жагсаалт */
export function analyticsPeriods(from: string, to: string, granularity: AnalyticsGranularity): string[] {
  const out: string[] = [];
  if (granularity === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }
  let [y, m] = from.slice(0, 7).split('-').map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (;;) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    if (p > end) break;
    out.push(p);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
