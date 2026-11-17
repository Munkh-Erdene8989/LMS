/** Кредит, цэнэглэлт (QPay). Бүх дүн бүхэл тоо: кредит, ₮. */

export type CreditEntryType = 'TOPUP' | 'SUBSCRIPTION_GRANT' | 'SPEND' | 'EXPIRE' | 'ADMIN_ADJUST';
export type PaymentStatus = 'PENDING' | 'PAID' | 'AMOUNT_MISMATCH' | 'FAILED' | 'CANCELED';

/** `GET /credits/packages` (хэрэглэгч), `GET /admin/credit-packages` (админ) */
export interface CreditPackageView {
  id: string;
  name: string;
  credits: number;
  priceMnt: number;
  active: boolean;
  /** Зөвхөн админд харагдах туршилтын багц */
  isTest: boolean;
  position: number;
}

export interface CreditLotView {
  id: string;
  source: CreditEntryType;
  initial: number;
  remaining: number;
  expiresAt: string;
  createdAt: string;
}

/** `GET /credits` — хүчинтэй (дуусаагүй, үлдэгдэлтэй) lot-ууд, дуусах дарааллаар */
export interface CreditBalanceView {
  balance: number;
  lots: CreditLotView[];
}

export interface CreditEntryView {
  id: string;
  type: CreditEntryType;
  /** Тэмдэгтэй: орлого +, зарлага − */
  amount: number;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  paymentId: string | null;
  isTest: boolean;
  createdAt: string;
}

export interface CreditHistoryPage {
  items: CreditEntryView[];
  nextCursor: string | null;
}

export interface QPayDeeplinkView {
  name: string;
  description: string;
  logo: string;
  link: string;
}

/** `POST /credits/topups`, `GET /credits/topups/:id`, `POST /credits/topups/:id/check` */
export interface TopupView {
  id: string;
  status: PaymentStatus;
  credits: number;
  amountMnt: number;
  isTest: boolean;
  /** Base64 PNG (data: угтваргүй) */
  qrImage: string | null;
  qrText: string | null;
  shortUrl: string | null;
  deeplinks: QPayDeeplinkView[];
  paidAt: string | null;
  createdAt: string;
}

/** `POST /admin/credits/adjust` */
export interface CreditAdjustResult {
  userId: string;
  balance: number;
  /** Ledger-ийн ADMIN_ADJUST бичилт */
  entryId: string;
  /** Ижил idempotencyKey-ээр өмнө хийгдсэн (шинэ бичилтгүй) */
  replayed: boolean;
}
