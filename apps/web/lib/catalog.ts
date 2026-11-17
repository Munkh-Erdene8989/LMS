import {
  CATALOG_SORTS,
  COURSE_LEVELS,
  type CatalogPage,
  type CatalogSort,
  type CategoryNode,
  type CourseLevel,
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
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return (await res.json()) as T;
}

export const fetchCategories = () => getPublic<CategoryNode[]>('/categories');
export const fetchCourse = (id: string) =>
  getPublic<PublicCourseDetail>(`/catalog/courses/${encodeURIComponent(id)}`, true);
export const fetchTeacher = (id: string) => getPublic<PublicTeacherProfile>(`/catalog/teachers/${encodeURIComponent(id)}`);
/** Lesson контент (PDF signed URL богино хугацаатай) — кэшлэхгүй. 403 = эрхгүй. */
export async function fetchLesson(id: string): Promise<PublicLessonContent | 'locked' | null> {
  const res = await fetch(`${API_URL}/catalog/lessons/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: await viewerHeaders(),
  });
  if (res.status === 403) return 'locked';
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${res.status}: lesson`);
  return (await res.json()) as PublicLessonContent;
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
  const res = await fetch(`${API_URL}/catalog/courses?${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: catalog`);
  return (await res.json()) as CatalogPage;
}
