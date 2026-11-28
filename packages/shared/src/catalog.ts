/** Каталог: ангилал, курс, section, lesson. */

import type { VideoLessonContent } from './media';
import type { CourseViewerState, LessonAccessReason } from './purchases';

export type CourseLevel = 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export const COURSE_LEVELS: readonly CourseLevel[] = ['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
export type CourseStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED';
export type LessonType = 'VIDEO' | 'TEXT' | 'PDF' | 'QUIZ' | 'ASSIGNMENT' | 'LIVE';
export type LessonReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Одоогоор үүсгэж болох төрлүүд (бусад нь дараагийн ticket-үүдэд). */
export const AVAILABLE_LESSON_TYPES: readonly LessonType[] = ['VIDEO', 'TEXT', 'PDF', 'QUIZ', 'ASSIGNMENT', 'LIVE'];

export const PDF_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Хичээлийн татаж авах материал. Зөвшөөрөгдсөн MIME → storage key-ийн өргөтгөл. HTML, SVG, гүйцэтгэх файл
 * зориуд ороогүй (storage-аас шууд нээгдэхэд XSS / хор хөнөөлтэй).
 */
export const LESSON_ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
};
/** `<input accept>`-д: өргөтгөлөөр (зарим OS MIME-ийг буруу/хоосон өгдөг). */
export const LESSON_ATTACHMENT_ACCEPT = '.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.png,.jpg,.jpeg,.webp,.mp3';
const ATTACHMENT_EXT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
};

/**
 * Upload-д ашиглах Content-Type: browser-ийн өгсөн төрөл зөвшөөрөгдсөн бол түүнийг, үгүй бол (Windows дээр .md,
 * .csv хоосон эсвэл `application/vnd.ms-excel` гэх мэт) өргөтгөлөөр. Танихгүй бол null.
 */
export function attachmentContentType(fileName: string, browserType: string): string | null {
  if (browserType && LESSON_ATTACHMENT_TYPES[browserType]) {
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    // Windows .csv-г `application/vnd.ms-excel` гэдэг — өргөтгөл илүү найдвартай.
    return ATTACHMENT_EXT_TYPES[ext] ?? browserType;
  }
  return ATTACHMENT_EXT_TYPES[fileName.toLowerCase().split('.').pop() ?? ''] ?? null;
}

export const LESSON_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const LESSON_ATTACHMENTS_MAX = 10;

/**
 * Хичээлийн материал. `url` зөвхөн багш/админы засварлах view-д (богино хугацаатай signed URL);
 * learner `GET /catalog/lessons/:id/attachments/:attachmentId/url`-аар татах мөчид шинэ URL авна.
 */
export interface LessonAttachmentView {
  id: string;
  fileName: string;
  size: number;
  contentType: string;
  url?: string;
}

/** `GET /catalog/lessons/:id/attachments/:attachmentId/url` */
export interface LessonAttachmentUrl {
  url: string;
}
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  position: number;
  children: CategoryNode[];
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  /** true = олон сонголттой (бүх зөв сонголтыг яг таг сонгосон үед л зөв), false = нэг сонголттой */
  multiple: boolean;
  options: QuizOption[];
}

/**
 * Quiz-ийн контент. `answerKey` (асуултын id → зөв сонголтын id-ууд) ЗӨВХӨН багш/админы засварлах,
 * шалгах view-д; learner-т (`GET /catalog/lessons/:id`) хэзээ ч илгээгдэхгүй.
 */
export interface QuizContent {
  type: 'QUIZ';
  /** Тэнцэх оноо, 0–100 % */
  passPercent: number;
  questions: QuizQuestion[];
  answerKey?: Record<string, string[]>;
}

/** Багшийн quiz засварлах оролт (`PATCH /teacher/lessons/:id { content }`). id-гүй бол API шинээр үүсгэнэ. */
export interface QuizContentInput {
  passPercent: number;
  questions: {
    id?: string;
    text: string;
    multiple: boolean;
    options: { id?: string; text: string; correct: boolean }[];
  }[];
}

export const QUIZ_MAX_QUESTIONS = 100;
export const QUIZ_MAX_OPTIONS = 10;
export const QUIZ_DEFAULT_PASS_PERCENT = 70;

/** Lesson-ы контент (төрлөөр). Teacher/admin-д бүтнээр; learner-т зөвхөн эрхтэй үед, quiz-ийн хариугүй. */
export type LessonContent =
  | { type: 'TEXT'; markdown: string }
  | { type: 'PDF'; fileName: string | null; size: number | null; url: string | null }
  | QuizContent
  | LiveLessonContent
  | VideoLessonContent
  | AssignmentLessonContent
  | { type: Exclude<LessonType, 'TEXT' | 'PDF' | 'QUIZ' | 'LIVE' | 'VIDEO' | 'ASSIGNMENT'> };

/**
 * Даалгавар (ticket 13): тайлбар (Markdown) + хамгийн их оноо. Эрхтэй (preview ч) бүх хүнд харагдана;
 * илгээлт, үнэлгээ `learning.ts`-ийн `AssignmentState`-д.
 */
export interface AssignmentLessonContent {
  type: 'ASSIGNMENT';
  instructions: string;
  maxScore: number | null;
}

/** Багшийн оролт (`PATCH /teacher/lessons/:id { content }`). */
export interface AssignmentContentInput {
  instructions: string;
  maxScore: number;
}

export const ASSIGNMENT_MAX_SCORE_LIMIT = 1000;
export const ASSIGNMENT_INSTRUCTIONS_MAX = 20_000;

/**
 * Live хичээл (ticket 14). Цаг ISO (UTC); UI Улаанбаатарын цагаар харуулна (`formatUbDateTime`).
 * `meetingUrl` зөвхөн эзэмшигч, курсийн багш, админд; free preview-ээр үзэж буй хүнд null.
 */
export interface LiveLessonContent {
  type: 'LIVE';
  startsAt: string | null;
  durationMinutes: number | null;
  endsAt: string | null;
  meetingUrl: string | null;
}

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
  /** Татаж авах материал (signed URL-тай) */
  attachments: LessonAttachmentView[];
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
 * Үнэлгээ (ticket 18): нуугдаагүй review-уудын дундаж. Review-гүй курст `{ average: null, count: 0 }`.
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
  /** Live хичээлийн хуваарь (нийтэд харагдана, линк биш). Бусад төрөлд null. */
  live: { startsAt: string | null; durationMinutes: number | null } | null;
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
  /** Татаж авах материал (`url`-гүй — татах үед тусад нь авна) */
  attachments: LessonAttachmentView[];
}

/** `GET /catalog/teachers/:id` */
export interface PublicTeacherProfile extends PublicTeacherRef {
  bio: string | null;
  expertise: string | null;
  courses: CatalogCourseCard[];
}
