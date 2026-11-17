import type { CourseRating } from './catalog';

// ---------------------------------------------------------------------------
// Үнэлгээ ба сэтгэгдэл (ticket 18)
// ---------------------------------------------------------------------------

export const REVIEW_BODY_MAX = 5000;
export const REVIEW_REPLY_MAX = 3000;

export interface ReviewAuthorRef {
  id: string;
  /** Багш бол нийтийн нэр (`displayName`); суралцагч бол profile-ийн нэр, үгүй бол "Суралцагч" */
  name: string;
  avatarUrl: string | null;
}

export interface ReviewReplyView {
  id: string;
  author: ReviewAuthorRef;
  /** Курсийн багш бичсэн эсэх */
  byTeacher: boolean;
  body: string;
  createdAt: string;
  /** Админ нуусан (зөвхөн админы жагсаалтад true байж болно) */
  hidden: boolean;
  hiddenReason: string | null;
}

export interface ReviewView {
  id: string;
  courseId: string;
  /** 1–5 */
  rating: number;
  body: string;
  author: ReviewAuthorRef;
  createdAt: string;
  /** Зохиогч сүүлд зассан үе */
  editedAt: string | null;
  /** Админ нуусан — нийтэд харагдахгүй, дундажид орохгүй (зохиогч өөрийнхөө нуугдсаныг хардаг) */
  hidden: boolean;
  hiddenReason: string | null;
  /** Хуучнаас шинэ рүү */
  replies: ReviewReplyView[];
}

/** Нэвтэрсэн хэрэглэгчийн тухайн курсийн үнэлгээний төлөв */
export interface ReviewViewerState {
  /** Шинээр үнэлгээ бичих эрхтэй (босго хангасан, багш биш). Аль хэдийн бичсэн бол засах эрхтэй. */
  eligible: boolean;
  /** Эзэмшсэн нийтлэгдсэн lesson-ы хувь (0–100, доош бүхэлчилсэн) */
  ownedPercent: number;
  /** Тохиргооны босго (`reviewMinOwnedPercent`) */
  requiredPercent: number;
  /** Курсийн багш — үнэлгээ бичихгүй, бүх үнэлгээнд хариулна */
  isTeacher: boolean;
  /** Өөрийн үнэлгээ (нуугдсан ч) */
  review: ReviewView | null;
}

/** `GET /catalog/courses/:id/reviews` — нуугдаагүй үнэлгээ, шинэ нь эхэнд */
export interface CourseReviewPage {
  rating: CourseRating;
  /** Үнэлгээ бичих босго (`reviewMinOwnedPercent`) — зочинд тайлбар харуулахад */
  requiredPercent: number;
  items: ReviewView[];
  nextCursor: string | null;
  /** Зочинд null */
  viewer: ReviewViewerState | null;
}

/** `PUT /courses/:id/review` */
export interface ReviewInput {
  rating: number;
  body?: string;
}

/** Админы жагсаалтын мөр */
export interface AdminReviewView extends ReviewView {
  course: { id: string; title: string };
  hiddenBy: { id: string; name: string | null } | null;
  hiddenAt: string | null;
}

/** `GET /admin/reviews` */
export interface AdminReviewPage {
  items: AdminReviewView[];
  nextCursor: string | null;
}
