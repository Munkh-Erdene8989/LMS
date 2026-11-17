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
}

export interface QuizAttemptResult {
  attempt: QuizAttemptView;
  progress: LessonProgressView;
  quiz: QuizState;
}
