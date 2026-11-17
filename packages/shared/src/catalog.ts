/** Каталог: ангилал, курс, section, lesson. */

import type { CourseViewerState, LessonAccessReason } from './purchases';

export type CourseLevel = 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export const COURSE_LEVELS: readonly CourseLevel[] = ['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
export type CourseStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED';
export type LessonType = 'VIDEO' | 'TEXT' | 'PDF' | 'QUIZ' | 'ASSIGNMENT' | 'LIVE';
export type LessonReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Одоогоор үүсгэж болох төрлүүд (бусад нь дараагийн ticket-үүдэд). */
export const AVAILABLE_LESSON_TYPES: readonly LessonType[] = ['TEXT', 'PDF'];

export const PDF_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  position: number;
  children: CategoryNode[];
}

/** Lesson-ы контент (төрлөөр). Teacher/admin-д бүтнээр; learner-т зөвхөн эрхтэй үед (дараагийн ticket). */
export type LessonContent =
  | { type: 'TEXT'; markdown: string }
  | { type: 'PDF'; fileName: string | null; size: number | null; url: string | null }
  | { type: Exclude<LessonType, 'TEXT' | 'PDF'> };

export interface LessonView {
  id: string;
  sectionId: string;
  title: string;
  type: LessonType;
  position: number;
  priceCredits: number;
  isFreePreview: boolean;
  reviewStatus: LessonReviewStatus;
  reviewNote: string | null;
  archived: boolean;
  /** Илгээхэд дутуу зүйл (хоосон бол бэлэн) */
  problems: string[];
  content: LessonContent;
}

export interface SectionView {
  id: string;
  title: string;
  position: number;
  lessons: LessonView[];
}

export interface CourseSummary {
  id: string;
  title: string;
  status: CourseStatus;
  coverUrl: string | null;
  priceCredits: number | null;
  lessonCount: number;
  /** Шалгалт хүлээж буй lesson-ууд (нийтлэгдсэн курсэд) */
  pendingLessonCount: number;
  updatedAt: string;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  categoryId: string | null;
  level: CourseLevel;
  priceCredits: number | null;
  status: CourseStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  /** Lesson-уудын нийт үнэ (архивласныг оруулахгүй) — бүтэн үнэ үүнээс бага байх ёстой */
  lessonsTotalCredits: number;
  /** Курсийг шалгуулахад дутуу зүйл */
  problems: string[];
  sections: SectionView[];
  teacher: { id: string; name: string | null };
}

/** Админы шалгах дараалал */
export interface ReviewQueueItem {
  course: CourseSummary;
  teacher: { id: string; name: string | null };
  /** `COURSE` — курс бүхэлдээ; `LESSONS` — нийтлэгдсэн курсийн шинэ lesson-ууд */
  kind: 'COURSE' | 'LESSONS';
  submittedAt: string | null;
}

export interface UploadTicket {
  key: string;
  url: string;
  method: 'PUT';
}

// ---------------------------------------------------------------------------
// Нийтийн каталог (ticket 07) — нэвтрэлтгүй. Зөвхөн PUBLISHED курс, APPROVED + архивлаагүй lesson.
// ---------------------------------------------------------------------------

export type CatalogSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'rating';
export const CATALOG_SORTS: readonly CatalogSort[] = ['relevance', 'newest', 'price_asc', 'price_desc', 'rating'];
export const CATALOG_PAGE_SIZE = 12;

/**
 * Үнэлгээ (ticket 18-д review нэмэгдэнэ). Одоогоор бүх курст `{ average: null, count: 0 }`.
 * `minRating` шүүлтүүр average-ээр, `rating` эрэмбэ average (null сүүлд)-аар ажилладаг.
 */
export interface CourseRating {
  /** 1–5, нэг оронгийн нарийвчлалтай; review байхгүй бол null */
  average: number | null;
  count: number;
}

export interface PublicTeacherRef {
  id: string;
  /** Зөвшөөрөгдсөн багшийн өргөдлийн `displayName`, үгүй бол хэрэглэгчийн нэр */
  name: string;
  avatarUrl: string | null;
}

export interface PublicCategoryRef {
  id: string;
  name: string;
  slug: string;
  /** Дэд ангилал бол эх ангилал */
  parent: { id: string; name: string; slug: string } | null;
}

/** Каталогийн карт */
export interface CatalogCourseCard {
  id: string;
  title: string;
  /** Тайлбарын эхний хэсэг (≤ 200 тэмдэгт) */
  excerpt: string;
  coverUrl: string | null;
  level: CourseLevel;
  /** Курсийн бүтэн үнэ (кредит) */
  priceCredits: number;
  lessonCount: number;
  hasFreePreview: boolean;
  teacher: PublicTeacherRef;
  category: PublicCategoryRef | null;
  rating: CourseRating;
  publishedAt: string;
}

/** `GET /catalog/courses` query. Бүгд заавал биш. */
export interface CatalogQuery {
  q?: string;
  /** Ангиллын slug — үндсэн ангилал бол дэд ангиллуудын курсууд орно */
  category?: string;
  level?: CourseLevel;
  minPrice?: number;
  maxPrice?: number;
  /** 1–5 */
  minRating?: number;
  /** true бол free preview lesson-тэй курс л */
  freePreview?: boolean;
  /** Анхдагч: `q` байвал `relevance`, үгүй бол `newest` */
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
}

export interface CatalogPage {
  items: CatalogCourseCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicLessonItem {
  id: string;
  title: string;
  type: LessonType;
  priceCredits: number;
  isFreePreview: boolean;
}

export interface PublicSection {
  id: string;
  title: string;
  lessons: PublicLessonItem[];
}

export interface CoursePricing {
  /** Курсийн жагсаалтын бүтэн үнэ */
  listCredits: number;
  /** Хичээлүүдийг тус тусад нь авбал нийт үнэ */
  lessonsTotalCredits: number;
  /** Энэ хэрэглэгч курсийн lesson-уудад аль хэдийн зарцуулсан кредит (нэвтрээгүй бол 0) */
  alreadySpentCredits: number;
  /**
   * Энэ хэрэглэгч курсийг бүтнээр авахад төлөх дүн = max(0, list − аль хэдийн зарцуулсан).
   * Курсийг бүтнээр авсан бол 0.
   */
  payableCredits: number;
}

/** `GET /catalog/courses/:id` */
export interface PublicCourseDetail extends Omit<CatalogCourseCard, 'excerpt' | 'teacher'> {
  description: string;
  teacher: PublicTeacherRef & { bio: string | null };
  pricing: CoursePricing;
  sections: PublicSection[];
  /** Нэвтэрсэн үед л (optional auth) — эзэмшил, багш/админ эсэх */
  viewer: CourseViewerState | null;
}

/** `GET /catalog/lessons/:id` — зөвхөн контент үзэх эрхтэй үед (`LessonAccessPolicy`). */
export interface PublicLessonContent {
  lesson: PublicLessonItem;
  /** Контент яагаад нээлттэй вэ (preview, эзэмшсэн, багш, админ) */
  access: LessonAccessReason;
  course: { id: string; title: string };
  /** PDF-ийн `url` богино хугацаатай signed URL */
  content: LessonContent;
}

/** `GET /catalog/teachers/:id` */
export interface PublicTeacherProfile extends PublicTeacherRef {
  bio: string | null;
  expertise: string | null;
  courses: CatalogCourseCard[];
}
