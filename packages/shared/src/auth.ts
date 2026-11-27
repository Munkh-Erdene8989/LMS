/** Web болон API хоёулаа ашиглах нэвтрэлтийн төрлүүд. */

export type Role = 'LEARNER' | 'TEACHER' | 'ADMIN';
export type IdentifierType = 'PHONE' | 'EMAIL';

export interface AuthIdentifier {
  type: IdentifierType;
  value: string;
  verifiedAt: string;
}

/** `GET /me`, нэвтэрсний дараах хариу */
export interface AuthUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  roles: Role[];
  identifiers: AuthIdentifier[];
  /** Платформын house teacher аккаунт эсэх (private курс зохиох эрх) — зөвхөн `/me` хариунд */
  isHouseTeacher?: boolean;
}

/** `POST /auth/otp/start`, `POST /me/identifiers/start` */
export interface OtpStartResponse {
  challengeId: string;
  type: IdentifierType;
  expiresAt: string;
  /** Зөвхөн утсанд: хэрэглэгч `code`-ыг `shortcode` руу SMS-ээр илгээнэ (verify.mn). */
  phone?: { code: string; shortcode: string; smsUri: string; displayInstruction: string };
}

/** `POST /auth/otp/verify` — утсанд SMS ирээгүй бол 202 + `pending`. */
export type OtpVerifyResponse = { status: 'pending' } | { status: 'verified'; user: AuthUser; isNew: boolean };

export interface ApiErrorBody {
  code: string;
  message: string;
}
