/** Монголын банкууд — payout-ийн данс. Нэрийг web translation-аас (`banks.<code>`). */
export const BANKS = [
  'KHAN',
  'GOLOMT',
  'TDB',
  'XAC',
  'STATE',
  'CAPITRON',
  'BOGD',
  'ARIG',
  'TRANS',
  'CKB',
  'MBANK',
  'NIB',
] as const;
export type BankCode = (typeof BANKS)[number];

export type TeacherApplicationStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface BankAccountView {
  bank: BankCode;
  accountNumber: string;
  holderName: string;
  updatedAt: string;
}

export interface TeacherApplicationView {
  id: string;
  status: TeacherApplicationStatus;
  displayName: string;
  bio: string;
  expertise: string;
  sampleUrl: string;
  agreementVersion: number;
  agreementAcceptedAt: string;
  submittedAt: string;
  /** Буцаасан шалтгаан */
  reviewNote: string | null;
  reviewedAt: string | null;
}

/** `GET /teacher/application` */
export interface MyTeacherApplication {
  /** Баталгаажсан утастай эсэх (өргөдөл гаргах нөхцөл) */
  hasVerifiedPhone: boolean;
  isTeacher: boolean;
  /** Одоо нийтлэгдсэн багшийн гэрээний хувилбар; нийтлэгдээгүй бол null */
  currentAgreementVersion: number | null;
  application: TeacherApplicationView | null;
  bankAccount: BankAccountView | null;
}

/** Админы дараалалд */
export interface AdminTeacherApplicationView extends TeacherApplicationView {
  user: { id: string; name: string | null; phone: string | null; email: string | null };
  bankAccount: BankAccountView | null;
  reviewedBy: { id: string; name: string | null } | null;
}
