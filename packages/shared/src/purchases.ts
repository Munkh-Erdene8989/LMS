/** Худалдан авалт, эрх, багшийн орлого (ticket 09). Мөнгөн дүн бүгд бүхэл (кредит, ₮). */

export type PurchaseKind = 'LESSON' | 'COURSE';

/** PLATFORM = платформын өөрийн суралцагч; REFERRAL = багшийн referral линкээр (ticket 11). */
export type PurchaseAttribution = 'PLATFORM' | 'REFERRAL';

/**
 * `POST /purchases/lessons/:id`, `POST /purchases/courses/:id` хүсэлт.
 * `confirmNoRefund` — хэрэглэгч "буцаалтгүй" анхааруулгыг зөвшөөрсөн (заавал `true`).
 * `expectedCredits` — хэрэглэгчийн харсан үнэ; одоогийн үнэтэй таарахгүй бол 409 `PRICE_CHANGED`.
 */
export interface PurchaseRequest {
  confirmNoRefund: true;
  expectedCredits: number;
}

export interface PurchaseView {
  id: string;
  kind: PurchaseKind;
  course: { id: string; title: string };
  /** LESSON үед */
  lesson: { id: string; title: string } | null;
  /** Жагсаалтын үнэ (lesson эсвэл курсийн бүтэн үнэ) */
  listCredits: number;
  /** Бодит зарцуулсан кредит (курсэд өмнө төлсөн lesson-ы кредит хасагдсан) */
  credits: number;
  /** Энэ худалдан авалтаар нээгдсэн lesson-ын тоо */
  lessonCount: number;
  isTest: boolean;
  createdAt: string;
}

/** Худалдан авалтын хариу */
export interface PurchaseResult {
  purchase: PurchaseView;
  /** Худалдан авалтын дараах кредитийн үлдэгдэл */
  balance: number;
}

export interface PurchasePage {
  items: PurchaseView[];
  nextCursor: string | null;
}

/** Нэвтэрсэн хэрэглэгчийн тухайн курстэй холбоотой төлөв (`PublicCourseDetail.viewer`). */
export interface CourseViewerState {
  /** Курсийг бүтнээр авсан (дараа нэмэгдэх lesson-ууд ч нээгдэнэ) */
  ownsCourse: boolean;
  /** Эзэмшиж буй (контент нь нээлттэй) lesson-ууд */
  ownedLessonIds: string[];
  /** Курсийн багш эсвэл админ — бүх lesson-ыг худалдан авалтгүй үзнэ */
  canViewAll: boolean;
  /** Идэвхтэй байгууллагын гишүүн ба курс тэр байгууллагад олгогдсон (ticket 44) — бүх lesson нээлттэй, худалдан авалтгүй */
  orgAccess: boolean;
  /** Багш өөрийн курсийг авах боломжгүй */
  isTeacher: boolean;
}

/** Үзэгч lesson-ыг эзэмшиж буй эсэх: бүтэн курс эсвэл тухайн lesson-ыг авсан. */
export function ownsLessonIn(viewer: CourseViewerState | null | undefined, lessonId: string): boolean {
  return !!viewer && (viewer.ownsCourse || viewer.ownedLessonIds.includes(lessonId));
}

/**
 * Lesson-ы контент үзэгчид нээлттэй эсэх: эзэмшил, эсвэл курсийн багш / админ. API-ийн `LessonAccessPolicy`-тэй
 * ижил дараалал; free preview-г (lesson-ы шинж) энд тооцохгүй.
 */
export function canOpenLesson(viewer: CourseViewerState | null | undefined, lessonId: string): boolean {
  return !!viewer && (viewer.canViewAll || viewer.orgAccess || ownsLessonIn(viewer, lessonId));
}

/** Lesson-ы контент яагаад нээлттэй вэ */
export type LessonAccessReason = 'PREVIEW' | 'OWNED' | 'ORG' | 'TEACHER' | 'ADMIN';

export type TeacherEarningType = 'SALE_EARNING' | 'PAYOUT' | 'ADMIN_ADJUST';

export interface TeacherEarningEntryView {
  id: string;
  type: TeacherEarningType;
  /** Тэмдэгтэй ₮: орлого +, payout − */
  amountMnt: number;
  /** SALE_EARNING: худалдах мөчийн тооцооны оролт */
  credits: number | null;
  creditPriceMnt: number | null;
  commissionPercent: number | null;
  grossMnt: number | null;
  attribution: PurchaseAttribution | null;
  /** SALE_EARNING: юу зарагдсан */
  sale: { kind: PurchaseKind; courseTitle: string; lessonTitle: string | null } | null;
  reason: string | null;
  isTest: boolean;
  createdAt: string;
}

/** `GET /teacher/earnings` */
export interface TeacherEarningsView {
  /** Payout хийх боломжтой үлдэгдэл (₮, тест бичилтгүй) */
  balanceMnt: number;
  /** Нийт борлуулалтын орлого (₮, тест бичилтгүй) */
  totalEarnedMnt: number;
  /** Тест гүйлгээний үлдэгдэл (тусад нь) */
  testBalanceMnt: number;
  items: TeacherEarningEntryView[];
  nextCursor: string | null;
}
