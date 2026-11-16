/** Каталог: ангилал, курс, section, lesson. */

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
