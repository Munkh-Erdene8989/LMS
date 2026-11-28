/** Сертификат (ticket 15). */

/** Quiz-уудын хамгийн өндөр онооны дундаж энэ хувиас багагүй байх ёстой. */
export const CERTIFICATE_MIN_QUIZ_AVERAGE = 70;

/** Verify кодын үсэг: андуурагдах I, O, 0, 1-гүй 32 тэмдэгт (тэмдэгт бүр 5 бит). */
export const CERTIFICATE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CERTIFICATE_CODE_LENGTH = 16;

/** Хэрэглэгчийн оруулсан кодыг хэвийн болгоно (жижиг үсэг, зураас, зай) — буруу бол null. */
export function normalizeCertificateCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CERTIFICATE_CODE_LENGTH) return null;
  for (const ch of code) if (!CERTIFICATE_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** `ABCD-EFGH-JKLM-NPQR` — уншихад хялбар. */
export function formatCertificateCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

export interface CertificateView {
  code: string;
  courseId: string;
  recipientName: string;
  courseTitle: string;
  teacherName: string;
  quizAveragePercent: number | null;
  issuedAt: string;
}

/** Олгох нөхцөлийн явц (`GET /learning/courses/:id/certificate`). */
export interface CertificateEligibility {
  /** Курсийг бүтнээр нь авсан (`CourseEntitlement`); PRIVATE курст — байгууллагын эрхтэй */
  ownsCourse: boolean;
  /** PRIVATE курс: "бүтнээр авсан" нөхцөлийг байгууллагын эрх орлоно */
  viaOrganization: boolean;
  /** Нөхцөлд тооцогдох lesson (архивлаагүй, шалгагдсан; VIDEO/TEXT/PDF/QUIZ) */
  lessonCount: number;
  completedLessonCount: number;
  quizCount: number;
  /** floor(дундаж); quiz-гүй бол null */
  quizAveragePercent: number | null;
  minQuizAveragePercent: number;
  /** Profile-д нэр оруулаагүй — сертификат дээр нэр заавал */
  nameMissing: boolean;
  eligible: boolean;
}

export interface CertificateStatus {
  certificate: CertificateView | null;
  eligibility: CertificateEligibility;
}

/** `GET /certificates/verify/:code` — нийтийн шалгалт (нэвтрэхгүй). */
export interface CertificateVerification {
  code: string;
  recipientName: string;
  courseTitle: string;
  teacherName: string;
  issuedAt: string;
}
