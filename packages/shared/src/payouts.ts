import type { BankCode } from './teacher';

export type PayoutStatus = 'REQUESTED' | 'PAID' | 'REJECTED';

/** Хүсэлт гаргах боломжгүй шалтгаан (UI-д тайлбар харуулна) */
export type PayoutBlockReason = 'ON_HOLD' | 'OPEN_REQUEST' | 'NO_BANK_ACCOUNT' | 'BELOW_MINIMUM';

export interface PayoutView {
  id: string;
  status: PayoutStatus;
  amountMnt: number;
  /** Хүсэлт гаргах үеийн дансны хуулбар */
  bank: BankCode;
  accountNumber: string;
  holderName: string;
  requestedAt: string;
  processedAt: string | null;
  transferRef: string | null;
  rejectReason: string | null;
}

/** `GET /teacher/payouts` */
export interface TeacherPayoutsView {
  /** Ledger-ийн үлдэгдэл (₮, тест бичилтгүй) */
  balanceMnt: number;
  /** Нээлттэй хүсэлтэд түгжигдсэн дүн */
  lockedMnt: number;
  /** balance − locked */
  availableMnt: number;
  /** Тохиргооны босго (`payoutMinimumMnt`) */
  minimumMnt: number;
  onHold: boolean;
  hasBankAccount: boolean;
  /** null бол хүсэлт гаргаж болно */
  blockReason: PayoutBlockReason | null;
  openPayout: PayoutView | null;
  items: PayoutView[];
  nextCursor: string | null;
}

export interface AdminPayoutView extends PayoutView {
  teacher: { id: string; name: string | null; phone: string | null; email: string | null };
  /** Багшийн одоогийн ledger үлдэгдэл */
  teacherBalanceMnt: number;
  onHold: boolean;
  processedBy: { id: string; name: string | null } | null;
}

/** `GET /admin/payouts` */
export interface AdminPayoutPage {
  items: AdminPayoutView[];
  nextCursor: string | null;
}

/** `GET /admin/payouts/holds` */
export interface PayoutHoldView {
  teacher: { id: string; name: string | null; phone: string | null; email: string | null };
  reason: string;
  createdBy: { id: string; name: string | null } | null;
  createdAt: string;
}
