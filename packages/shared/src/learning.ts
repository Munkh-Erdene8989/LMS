/** Суралцах: "Миний сургалт", lesson-ы явц, quiz (ticket 12). */

import type { LessonType } from './catalog';

/** Видеог энэ хувиас дээш үзвэл lesson дууссанд тооцно. */
export const VIDEO_COMPLETE_PERCENT = 90;

export interface LessonProgressView {
  lessonId: string;
  completed: boolean;
  completedAt: string | null;
  /** VIDEO: хамгийн их үзсэн хувь (0–100) */
  watchedPercent: number;
  /** QUIZ: хамгийн өндөр оноо (0–100 %); оролдоогүй бол null */
  bestScorePercent: number | null;
  lastViewedAt: string | null;
}

/** `POST /learning/lessons/:id/progress` — lesson нээсэн / видео үзсэн хувь (ticket 10-ын player илгээнэ). */
export interface LessonProgressInput {
  watchedPercent?: number;
}

/** Курсийн явц — зөвхөн эзэмшиж буй, архивлаагүй lesson-уудаар. */
export interface CourseProgressSummary {
  ownedLessonCount: number;
  completedLessonCount: number;
  /** floor(completed / owned × 100) */
  progressPercent: number;
  /** "Үргэлжлүүлэх" — сүүлд нээсэн дуусаагүй lesson, үгүй бол дараалал дахь эхний дуусаагүй lesson */
  continueLessonId: string | null;
  lastViewedAt: string | null;
}

/** `GET /learning/courses` — "Миний сургалт"-ын карт */
export interface MyCourseCard extends CourseProgressSummary {
  id: string;
  title: string;
  coverUrl: string | null;
  teacher: { id: string; name: string };
  ownsCourse: boolean;
  /** Курсийн нийт (идэвхтэй) lesson */
  lessonCount: number;
}

export interface MyCourseLesson {
  id: string;
  title: string;
  type: LessonType;
  priceCredits: number;
  isFreePreview: boolean;
  /** Архивласан lesson (зөвхөн эзэмшигчид харагдана, явцын хувьд тооцогдохгүй) */
  archived: boolean;
  owned: boolean;
  progress: LessonProgressView | null;
}

/** `GET /learning/courses/:id` */
export interface MyCourseDetail extends CourseProgressSummary {
  id: string;
  title: string;
  coverUrl: string | null;
  teacher: { id: string; name: string };
  ownsCourse: boolean;
  sections: { id: string; title: string; lessons: MyCourseLesson[] }[];
}

export interface QuizAnswerInput {
  questionId: string;
  optionIds: string[];
}

/** `POST /learning/lessons/:id/quiz-attempts` */
export interface QuizAttemptInput {
  answers: QuizAnswerInput[];
}

export interface QuizAttemptView {
  id: string;
  correctCount: number;
  questionCount: number;
  /** floor(correct / total × 100) */
  scorePercent: number;
  passed: boolean;
  createdAt: string;
}

export interface QuizState {
  passPercent: number;
  questionCount: number;
  bestScorePercent: number | null;
  passed: boolean;
  /** Шинэ нь эхэндээ */
  attempts: QuizAttemptView[];
}

/** `GET /learning/lessons/:id` */
export interface LessonLearningState {
  progress: LessonProgressView;
  /** QUIZ lesson-д л */
  quiz: QuizState | null;
  /** ASSIGNMENT lesson-д л */
  assignment: AssignmentState | null;
}

export interface QuizAttemptResult {
  attempt: QuizAttemptView;
  progress: LessonProgressView;
  quiz: QuizState;
}

// ---- Даалгавар (ticket 13) ----------------------------------------------------

/** Илгээх файлын дээд хэмжээ. */
export const ASSIGNMENT_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const ASSIGNMENT_TEXT_MAX = 20_000;
export const ASSIGNMENT_COMMENT_MAX = 5_000;

/**
 * Сертификатын нөхцөлд (ticket 15) ТООЦОХГҮЙ lesson-ы төрлүүд: "бүх lesson дууссан" шалгалтаас хасна.
 * Даалгаврын оноо `lesson_progress.best_score_percent`-д хэзээ ч бичигдэхгүй (quiz-ийн дунджид орохгүй).
 */
export const CERTIFICATE_EXCLUDED_LESSON_TYPES: readonly LessonType[] = ['ASSIGNMENT'];

export interface SubmissionFileView {
  name: string;
  size: number;
  contentType: string;
}

export interface SubmissionReviewView {
  score: number;
  maxScore: number;
  comment: string | null;
  reviewedAt: string;
}

export interface SubmissionView {
  id: string;
  text: string | null;
  file: SubmissionFileView | null;
  submittedAt: string;
  /** null = шалгагдаагүй */
  review: SubmissionReviewView | null;
}

/** `GET /learning/lessons/:id` → `assignment` (ASSIGNMENT lesson-д л) */
export interface AssignmentState {
  maxScore: number;
  /** Зөвхөн эзэмшигч илгээнэ (free preview, багш, админ — үгүй) */
  canSubmit: boolean;
  /** Шинэ нь эхэндээ; эхнийх нь одоогийн (хамгийн сүүлийн) илгээлт */
  submissions: SubmissionView[];
}

/** `POST /learning/lessons/:id/assignment/upload` */
export interface AssignmentUploadInput {
  fileName: string;
  size: number;
}

/** `POST /learning/lessons/:id/assignment/submissions` — текст, файл хоёрын дор хаяж нэг. */
export interface AssignmentSubmitInput {
  text?: string;
  file?: { key: string; name: string };
}

/** `GET /learning/assignment-submissions/:id/file` — богино хугацаатай signed URL */
export interface SubmissionFileUrl {
  url: string;
  expiresInSeconds: number;
}

export type AssignmentInboxStatus = 'UNREVIEWED' | 'REVIEWED';

/** `GET /teacher/assignments?status=&courseId=&before=` — суралцагч × даалгавар бүрийн хамгийн сүүлийн илгээлт */
export interface AssignmentInboxItem extends SubmissionView {
  learner: { id: string; name: string | null };
  lesson: { id: string; title: string; maxScore: number };
  course: { id: string; title: string };
  /** Энэ суралцагч энэ даалгаварт хэд дэх удаагаа илгээсэн */
  attempt: number;
  /** Өмнөх илгээлтийн үнэлгээ (дахин илгээсэн бол) */
  previousReview: SubmissionReviewView | null;
}

export interface AssignmentInboxPage {
  items: AssignmentInboxItem[];
  nextCursor: string | null;
  unreviewedCount: number;
}

/** `POST /teacher/assignments/:submissionId/review` */
export interface AssignmentReviewInput {
  score: number;
  comment?: string;
}
