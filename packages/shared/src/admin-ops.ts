/** Админы хэрэглэгчийн удирдлага, төлбөрийн тохирол, тайлан (ticket 22). Мөнгө бүхэл ₮. */
import type { Role } from './auth';
import type { CreditBalanceView, CreditEntryType, PaymentStatus } from './credits';
import type { PurchaseKind, TeacherEarningType } from './purchases';
import type { SubscriptionStatus } from './subscriptions';

export interface AdminUserContact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** `GET /admin/users?q=` мөр */
export interface AdminUserRow extends AdminUserContact {
  roles: Role[];
  creditBalance: number;
  blockedAt: string | null;
  createdAt: string;
}

export interface AdminUserPage {
  items: AdminUserRow[];
  nextCursor: string | null;
}

export interface AdminLedgerEntryView {
  id: string;
  type: CreditEntryType;
  amount: number;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  isTest: boolean;
  actor: { id: string; name: string | null } | null;
  createdAt: string;
}

export interface AdminPurchaseRow {
  id: string;
  kind: PurchaseKind;
  courseTitle: string;
  lessonTitle: string | null;
  credits: number;
  isTest: boolean;
  createdAt: string;
}

export type PaymentPurposeView = 'CREDIT_TOPUP' | 'SUBSCRIPTION';
export type PaymentMethodView = 'INVOICE' | 'CARD';
export type PaymentResolutionView = 'GRANTED' | 'CLOSED';

export interface AdminPaymentRow {
  id: string;
  purpose: PaymentPurposeView;
  method: PaymentMethodView;
  status: PaymentStatus;
  amountMnt: number;
  /** QPay-ээс ирсэн бодит төлсөн дүн */
  paidAmountMnt: number | null;
  credits: number;
  isTest: boolean;
  providerInvoiceId: string | null;
  providerPaymentId: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
  lastCheckedAt: string | null;
  resolution: PaymentResolutionView | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
}

export interface AdminEarningEntryView {
  id: string;
  type: TeacherEarningType;
  amountMnt: number;
  reason: string | null;
  isTest: boolean;
  createdAt: string;
}

/** `GET /admin/users/:id` */
export interface AdminUserDetail extends AdminUserRow {
  blockedReason: string | null;
  credits: CreditBalanceView;
  ledger: AdminLedgerEntryView[];
  purchases: AdminPurchaseRow[];
  payments: AdminPaymentRow[];
  subscription: { status: SubscriptionStatus; planName: string; currentPeriodEnd: string | null } | null;
  /** Багш (эсвэл орлогын түүхтэй) бол */
  earnings: {
    balanceMnt: number;
    /** Нээлттэй payout хүсэлтэд түгжигдсэн */
    lockedMnt: number;
    testBalanceMnt: number;
    onHold: boolean;
    recent: AdminEarningEntryView[];
  } | null;
}

/** `POST /admin/users/:id/earnings/adjust` */
export interface EarningsAdjustResult {
  entryId: string;
  balanceMnt: number;
  lockedMnt: number;
  /** Ижил idempotencyKey-ээр өмнө хийгдсэн (шинэ бичилтгүй) */
  replayed: boolean;
}

// ---- Төлбөрийн тохирол (ticket 08/17-ийн үлдэгдэл) ------------------------------------------

/**
 * - `STALE_PENDING` — удаан PENDING (callback ирээгүй / нэхэмжлэх үүсээгүй)
 * - `CARD_UNSETTLED` — картаас татагдсан (`providerPaymentId`-тэй) ч олголт хийгдээгүй PENDING
 * - `AMOUNT_MISMATCH` — төлсөн дүн нэхэмжлэхтэй таараагүй, кредит олгоогүй
 * - `CANCELED_PAID` — цуцалсан нэхэмжлэх дараа нь төлөгдсөн (дахин шалгалтаар илэрсэн)
 */
export type PaymentIssueKind = 'STALE_PENDING' | 'CARD_UNSETTLED' | 'AMOUNT_MISMATCH' | 'CANCELED_PAID';
export const PAYMENT_ISSUE_KINDS: readonly PaymentIssueKind[] = [
  'CARD_UNSETTLED',
  'AMOUNT_MISMATCH',
  'CANCELED_PAID',
  'STALE_PENDING',
];

export interface PaymentIssueView extends AdminPaymentRow {
  kind: PaymentIssueKind;
  user: AdminUserContact;
}

/** `GET /admin/payments/issues` */
export interface PaymentIssuesView {
  items: PaymentIssueView[];
  counts: Record<PaymentIssueKind, number>;
  /** PENDING-ийг хэдэн минутаас "хуучирсан" гэж үзсэн */
  staleMinutes: number;
}

export type PaymentResolveAction = 'GRANT' | 'CLOSE';

/** `POST /admin/payments/reconcile-canceled` */
export interface ReconcileCanceledResult {
  checked: number;
  /** Цуцалсан ч төлөгдсөн нь илэрсэн */
  found: number;
  failed: number;
}

// ---- Тайлан ----------------------------------------------------------------------------------

export interface ReportRange {
  /** YYYY-MM-DD (Улаанбаатар), хоёулаа орно */
  from: string;
  to: string;
}

export interface RevenueTotals {
  /** Бодит орсон мөнгө (QPay-ийн төлсөн дүн) */
  totalMnt: number;
  topupMnt: number;
  subscriptionMnt: number;
  payments: number;
}

export interface CreditTotals {
  /** Цэнэглэлтээр олгосон */
  topup: number;
  subscriptionGrant: number;
  spent: number;
  expired: number;
  adminAdded: number;
  adminRemoved: number;
}

export interface AdminSalesTotals {
  purchases: number;
  credits: number;
  /** credits × худалдах үеийн кредитийн ₮ үнэ */
  grossMnt: number;
  teacherEarningsMnt: number;
  /** gross − багшийн орлого */
  platformMnt: number;
}

export interface ReportTopCourse {
  courseId: string;
  title: string;
  teacher: { id: string; name: string | null };
  purchases: number;
  credits: number;
  grossMnt: number;
}

export interface ReportTopTeacher {
  teacher: { id: string; name: string | null };
  sales: number;
  grossMnt: number;
  earningsMnt: number;
}

export interface ReportSection {
  revenue: RevenueTotals;
  credits: CreditTotals;
  sales: AdminSalesTotals;
}

/** `GET /admin/reports/summary?from&to` — `is_test` гүйлгээ `test` хэсэгт тусдаа, үндсэн тоонд орохгүй. */
export interface AdminReportSummary {
  range: ReportRange;
  live: ReportSection;
  test: ReportSection;
  payoutsPaidMnt: number;
  topCourses: ReportTopCourse[];
  topTeachers: ReportTopTeacher[];
}

export interface ExpiredCreditTotals {
  credits: number;
  lots: number;
}

export interface ExpiredLotRow {
  lotId: string;
  user: AdminUserContact;
  source: CreditEntryType;
  initial: number;
  /** Дуусгавраар хасагдсан */
  expiredCredits: number;
  expiresAt: string;
  isTest: boolean;
}

/** `GET /admin/reports/expired-credits?from&to` (ticket 16-ийн үлдэгдэл) */
export interface ExpiredCreditsReport {
  range: ReportRange;
  live: ExpiredCreditTotals;
  test: ExpiredCreditTotals;
  /** Ойрын 30 хоногт дуусах үлдэгдэл (тест бус / тест) */
  upcoming30d: { live: number; test: number };
  items: ExpiredLotRow[];
}

// ---- Тойм ------------------------------------------------------------------------------------

/** Админы анхаарал хүлээж буй ажлын тоо — тойм болон цэсний badge. */
export interface AdminPendingCounts {
  /** SUBMITTED багшийн өргөдөл */
  teacherApplications: number;
  /** Хяналтын дараалал дахь курс (шинэ курс эсвэл нийтлэгдсэн курсийн шинэ хичээл) */
  courseReviews: number;
  /** REQUESTED payout */
  payouts: number;
  /** Шийдээгүй асуудалтай төлбөр (бүх төрөл) */
  paymentIssues: number;
}

/** `GET /admin/overview` */
export interface AdminOverview {
  pending: AdminPendingCounts;
}
