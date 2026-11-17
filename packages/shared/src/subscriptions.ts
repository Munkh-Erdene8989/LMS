/** Сарын багц (subscription, ticket 17). Бүх дүн бүхэл: кредит, ₮. */
import type { PaymentStatus, QPayDeeplinkView } from './credits';

export type SubscriptionStatus = 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED';
export type SubscriptionPaymentStatus = PaymentStatus;
export type SubscriptionPaymentMethod = 'INVOICE' | 'CARD';

/** `GET /subscription/plans` (идэвхтэй), `GET /admin/subscription-plans` (бүгд) */
export interface SubscriptionPlanView {
  id: string;
  name: string;
  priceMnt: number;
  /** Сар бүр олгох кредит */
  credits: number;
  active: boolean;
  position: number;
}

/** Нэг удаагийн төлбөр (нэхэмжлэх эсвэл картаар) */
export interface SubscriptionPaymentView {
  id: string;
  status: SubscriptionPaymentStatus;
  method: SubscriptionPaymentMethod;
  amountMnt: number;
  credits: number;
  /** Сунгалт бол сунгаж буй үеийн төгсгөл; эхлэх/дахин идэвхжүүлэхэд null */
  renewalFor: string | null;
  qrImage: string | null;
  qrText: string | null;
  shortUrl: string | null;
  deeplinks: QPayDeeplinkView[];
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentCardView {
  status: 'PENDING' | 'ACTIVE';
  maskedPan: string | null;
  brand: string | null;
}

export interface SubscriptionView {
  id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlanView;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** ACTIVE үед дараагийн сунгалт (= currentPeriodEnd); бусад үед null */
  nextRenewalAt: string | null;
  pastDueSince: string | null;
  /** PAST_DUE → PAUSED болох хугацаа */
  pauseAt: string | null;
  canceledAt: string | null;
  pausedAt: string | null;
}

/** `GET /subscription` */
export interface SubscriptionOverview {
  subscription: SubscriptionView | null;
  /** Төлөгдөөгүй (PENDING) нэхэмжлэх */
  pendingPayment: SubscriptionPaymentView | null;
  card: PaymentCardView | null;
  /** QPay карт холбох боломжтой эсэх (бодит QPay-д батлагдаагүй тул false) */
  cardSupported: boolean;
}

/** `POST /subscription`, `/subscription/reactivate`, `/subscription/pay` */
export interface SubscriptionActionResult {
  overview: SubscriptionOverview;
  /** Энэ үйлдлээр үүссэн/хийгдсэн төлбөр */
  payment: SubscriptionPaymentView | null;
}

/** `POST /subscription/card` */
export interface CardRegistrationStart {
  redirectUrl: string;
}
