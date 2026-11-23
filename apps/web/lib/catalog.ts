import {
  CATALOG_SORTS,
  COURSE_LEVELS,
  type CatalogPage,
  type CatalogSort,
  type CategoryNode,
  type CourseLevel,
  type CourseReviewPage,
  type PublicCourseDetail,
  type PublicLessonContent,
  type PublicTeacherProfile,
} from '@lms/shared';
import { cookies } from 'next/headers';
import { API_URL } from './api';

/**
 * Нэвтэрсэн хэрэглэгчийн access cookie-г (байвал) API руу дамжуулна — курс, lesson-ы endpoint optional auth:
 * хувийн үнэ, эзэмшил, эрхтэй контент. Хугацаа нь дууссан бол зочин мэт; client тал refresh хийгээд дахин уншина.
 */
async function viewerHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get('access_token')?.value;
  return token ? { cookie: `access_token=${encodeURIComponent(token)}` } : {};
}

/**
 * Нийтийн каталогийг server component-оос (SSR) уншина. Нэвтрэлтгүй.
 * `null` = олдсонгүй (404/400) → `notFound()`; бусад алдаа throw (error boundary / дахин ачаалах).
 */
async function getPublic<T>(path: string, withViewer = false): Promise<T | null> {
  const headers = withViewer ? await viewerHeaders() : {};
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers });
  } catch (err) {
    // Түр demo (ticket 33b): сүлжээ унасан үед харуулах өгөгдөл.
    const demo = await demoFallback<T>(path);
    if (demo !== undefined) return demo;
    throw err;
  }
  if (!res.ok) {
    const demo = await demoFallback<T>(path);
    if (demo !== undefined) return demo;
    if (res.status === 404 || res.status === 400) return null;
    throw new Error(`API ${res.status}: ${path}`);
  }
  const data = (await res.json()) as T;
  if (isEmptyPayload(data)) {
    const demo = await demoFallback<T>(path);
    if (demo !== undefined) return demo;
  }
  return data;
}

/**
 * Түр demo (ticket 33b). Флагийг ЭНД шууд `process.env.NEXT_PUBLIC_DEMO_DATA`-аар шалгана: bundler нь build үед
 * `false` болгож, салбар доторх динамик import-ийг (demo модуль бүхэлдээ) bundle-аас хасна. Модулийн `DEMO_ENABLED`
 * тогтмолыг import хийвэл модуль хоорондын тогтмол шингээлт хийгддэггүй тул dead-code болохгүй.
 */
async function demoFallback<T>(path: string): Promise<T | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { demoFor } = await import('./demo');
    return demoFor(path) as T | undefined;
  }
  return undefined;
}

/** Demo-д ашиглах: хоосон жагсаалт / `items` нь хоосон хуудас. */
function isEmptyPayload(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return Array.isArray(items) && items.length === 0;
  }
  return false;
}

export const fetchCategories = () => getPublic<CategoryNode[]>('/categories');
export const fetchCourse = (id: string) =>
  getPublic<PublicCourseDetail>(`/catalog/courses/${encodeURIComponent(id)}`, true);
export const fetchTeacher = (id: string) => getPublic<PublicTeacherProfile>(`/catalog/teachers/${encodeURIComponent(id)}`);
/** Lesson контент (PDF signed URL богино хугацаатай) — кэшлэхгүй. 403 = эрхгүй. */
export async function fetchLesson(id: string): Promise<PublicLessonContent | 'locked' | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/catalog/lessons/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      headers: await viewerHeaders(),
    });
  } catch (err) {
    const demo = await demoLesson(id);
    if (demo !== undefined) return demo;
    throw err;
  }
  if (!res.ok) {
    // Түр demo (ticket 33b): `demo-` хичээл API-д байхгүй (404/400/403) үед fixture.
    const demo = await demoLesson(id);
    if (demo !== undefined) return demo;
  }
  if (res.status === 403) return 'locked';
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${res.status}: lesson`);
  return (await res.json()) as PublicLessonContent;
}

/** Түр demo (ticket 33b): `demoFallback`-тай ижил — флагийг шууд шалгаж, динамик import-ийг салбар дотор хийнэ. */
async function demoLesson(id: string): Promise<PublicLessonContent | 'locked' | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { demoLesson: lesson } = await import('./demo');
    return lesson(id);
  }
  return undefined;
}

/** `/courses` хуудасны query string (URL нь хайлтын төлөвийн цорын ганц эх үүсвэр — JS-гүй ажиллана). */
export interface CatalogParams {
  q?: string;
  category?: string;
  level?: CourseLevel;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
  freePreview?: '1';
  sort?: CatalogSort;
  page?: string;
}

type RawParams = Record<string, string | string[] | undefined>;

const digits = (v: string | undefined) => (v && /^\d{1,7}$/.test(v) ? v : undefined);

/** Хөтчийн searchParams-ыг цэвэрлэнэ (буруу утгыг хаяна). */
export function parseCatalogParams(raw: RawParams): CatalogParams {
  const one = (k: string) => {
    const v = raw[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s : undefined;
  };
  const level = one('level');
  const sort = one('sort');
  const rating = one('minRating');
  const page = digits(one('page'));
  return {
    q: one('q')?.slice(0, 100),
    category: one('category')?.slice(0, 100),
    level: COURSE_LEVELS.includes(level as CourseLevel) ? (level as CourseLevel) : undefined,
    minPrice: digits(one('minPrice')),
    maxPrice: digits(one('maxPrice')),
    minRating: rating && /^[1-5]$/.test(rating) ? rating : undefined,
    freePreview: one('freePreview') ? '1' : undefined,
    sort: CATALOG_SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : undefined,
    page: page && page !== '0' && page !== '1' ? page : undefined,
  };
}

/** Тодорхой утгуудыг сольж `/courses?...` линк үүсгэнэ (шүүлтүүр солиход хуудас 1 рүү). */
export function catalogHref(params: CatalogParams, patch: Partial<CatalogParams> = {}): string {
  const merged: CatalogParams = { ...params, page: undefined, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/courses?${s}` : '/courses';
}

export async function fetchCatalog(params: CatalogParams): Promise<CatalogPage> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const page = await getPublic<CatalogPage>(`/catalog/courses?${qs}`);
  if (!page) throw new Error('API 4xx: catalog');
  return page;
}

/** Курсийн үнэлгээний эхний хуудас (нэвтэрсэн бол өөрийн төлөвтэй). Алдаа гарвал null — хуудас үнэлгээгүйгээр ч ажиллана. */
export async function fetchCourseReviews(id: string): Promise<CourseReviewPage | null> {
  return getPublic<CourseReviewPage>(`/catalog/courses/${encodeURIComponent(id)}/reviews`, true).catch(() => null);
}
