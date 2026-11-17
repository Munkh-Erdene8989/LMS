/** Referral ба attribution (ticket 11). */

/** `GET /teacher/referral` — багшийн referral линк, тохиргоо, товч статистик. */
export interface ReferralLinkView {
  code: string;
  /** Web дээрх зам (`/r/<code>`) — бүтэн URL-ийг web өөрөө угсарна */
  path: string;
  /** Линкээр орсноос хойш хэдэн хоногийн дотор худалдан авбал referral болох */
  windowDays: number;
  commissionReferralPercent: number;
  commissionPlatformPercent: number;
  stats: {
    /** Линкээр орж ирсэн (нэвтэрсэн) хэрэглэгчийн тоо */
    learners: number;
    /** Хугацаа нь дуусаагүй (одоо худалдан авбал referral болох) */
    activeLearners: number;
    /** Тест бус худалдан авалтын тоо attribution-аар */
    referralSales: number;
    platformSales: number;
  };
}

/** `POST /referrals/visit` (`{ code }`) — линкээр орсныг бүртгэнэ (cookie + нэвтэрсэн бол DB). */
export interface ReferralVisitResult {
  teacherId: string;
}
