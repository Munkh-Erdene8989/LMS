/** SPEC «Мөнгөний дүрэм» / «Шимтгэл ба referral»: анхдагч утгууд (админ тохируулна). */
export const CREDIT_MNT = 1000;
export const REFERRAL_FEE_PCT = 10;
export const PLATFORM_FEE_PCT = 40;

/** Багшийн орлого (₮) = кредит × кредитийн ₮ × (1 − шимтгэл). Бүхэл тоо (float-гүй). */
export function teacherEarningMnt(credits: number, feePct: number, creditMnt = CREDIT_MNT): number {
  return (credits * creditMnt * (100 - feePct)) / 100;
}

/** Курсийн төлөх үнэ = max(0, курсийн үнэ − тухайн курсийн хичээлд аль хэдийн зарцуулсан кредит). */
export function courseRemainingCredits(coursePrice: number, ownedLessons: number, lessonPrice: number): number {
  return Math.max(0, coursePrice - ownedLessons * lessonPrice);
}

/** Cover байхгүй үед курсийн id-аас тодорхойлогдох gradient-ийн өнгө (hue). */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export type VarStyle = React.CSSProperties & Record<`--${string}`, string | number>;
