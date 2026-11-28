/** Байгууллагын админ удирдлага ба урилга (ticket 45). Огноо ISO. */
import type { IdentifierType } from './auth';

export type OrgAdminStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

/** `GET /admin/organizations` мөр */
export interface OrgAdminRow {
  id: string;
  name: string;
  active: boolean;
  contractEndsAt: string;
  seatLimit: number;
  /** Идэвхтэй (хасагдаагүй) гишүүд */
  memberCount: number;
  /** Хүлээгдэж буй урилга — суудал эзэлнэ */
  pendingCount: number;
  /** active=false → INACTIVE; гэрээ дууссан → EXPIRED */
  status: OrgAdminStatus;
}

export interface OrgAdminMember {
  id: string;
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  joinedAt: string;
}

export type OrgInvitationState = 'PENDING' | 'ACCEPTED' | 'CANCELED';

export interface OrgAdminInvitation {
  id: string;
  identifierType: IdentifierType;
  value: string;
  status: OrgInvitationState;
  invitedAt: string;
  acceptedAt: string | null;
}

/** `GET /admin/organizations/:id` */
export interface OrgAdminDetail extends OrgAdminRow {
  members: OrgAdminMember[];
  /** Зөвхөн PENDING (идэвхтэй) урилга; түүх шаардлагагүй */
  invitations: OrgAdminInvitation[];
}

/**
 * Урилгын мөр бүрийн үр дүн.
 * - INVITED: pending урилга үүслээ (бүртгэлгүй identifier; нэвтрэхэд гишүүн болно)
 * - ADDED: баталгаажсан хэрэглэгч аль хэдийн байсан тул тэр дороо гишүүн болголоо
 * - ALREADY_MEMBER: идэвхтэй гишүүн
 * - ALREADY_INVITED: pending урилга аль хэдийн байгаа
 * - INVALID: утас/имэйлийн формат буруу
 * - NO_SEATS: суудал хүрэлцэхгүй
 */
export type OrgInviteOutcome = 'INVITED' | 'ADDED' | 'ALREADY_MEMBER' | 'ALREADY_INVITED' | 'INVALID' | 'NO_SEATS';

export interface OrgInviteRowResult {
  /** Хэрэглэгчийн оруулсан эх мөр */
  input: string;
  /** Normalize хийсэн утга (INVALID үед null) */
  value: string | null;
  outcome: OrgInviteOutcome;
}

export interface OrgInviteResult {
  results: OrgInviteRowResult[];
}

/** `GET /admin/organizations/:id/report` — мөр = гишүүн × олгосон курс (ticket 48) */
export interface OrgReportRow {
  memberId: string;
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** Гишүүн хасагдсан эсэх (`includeRemoved` үед л харагдана) */
  removed: boolean;
  courseId: string;
  courseTitle: string;
  /** Дууссан lesson / архивлаагүй нийт lesson, floor % */
  progressPercent: number;
  completedLessonCount: number;
  lessonCount: number;
  /** Quiz-уудын хамгийн өндөр онооны дундаж (floor); quiz-гүй курст null */
  quizAveragePercent: number | null;
  certificateCode: string | null;
  certificateIssuedAt: string | null;
  lastActivityAt: string | null;
}

export interface OrgReport {
  rows: OrgReportRow[];
}
