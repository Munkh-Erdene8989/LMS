/** Админ хэсгийн API хариуны төрлүүд. */

export type SettingUnit = 'MNT' | 'PERCENT' | 'DAYS' | 'MONTHS' | 'CREDITS';

export type SettingKey =
  | 'creditPriceMnt'
  | 'commissionPlatformPercent'
  | 'commissionReferralPercent'
  | 'referralWindowDays'
  | 'payoutMinimumMnt'
  | 'creditValidityMonths'
  | 'reviewMinOwnedPercent';

/** `GET /admin/settings` */
export interface SettingView {
  key: SettingKey;
  value: number;
  defaultValue: number;
  unit: SettingUnit;
  min: number;
  max: number;
  /** Хамгийн сүүлд өөрчилсөн огноо; анхдагч утга хэвээр бол null */
  updatedAt: string | null;
}

export interface SettingRevisionView {
  id: string;
  previous: number;
  value: number;
  changedBy: { id: string; name: string | null } | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actor: { id: string; name: string | null } | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
}

export type LegalDocType = 'TERMS' | 'PRIVACY' | 'TEACHER_AGREEMENT';
export const LEGAL_DOC_TYPES: readonly LegalDocType[] = ['TERMS', 'PRIVACY', 'TEACHER_AGREEMENT'];

/** URL дахь нэр: `/legal/terms` г.м */
export const LEGAL_SLUGS: Record<LegalDocType, string> = {
  TERMS: 'terms',
  PRIVACY: 'privacy',
  TEACHER_AGREEMENT: 'teacher-agreement',
};

export interface LegalDocView {
  id: string;
  type: LegalDocType;
  version: number;
  title: string;
  body: string;
  /** null = ноорог */
  publishedAt: string | null;
  updatedAt: string;
}

/** `GET /me/legal` — тухайн төрлийн одоогийн хувилбарыг зөвшөөрсөн эсэх */
export interface LegalStatus {
  type: LegalDocType;
  currentVersion: number | null;
  acceptedVersion: number | null;
  acceptedAt: string | null;
  upToDate: boolean;
}
