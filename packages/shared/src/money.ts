/**
 * Мөнгөний дүрэм (SPEC «Мөнгөний дүрэм» / «Шимтгэл ба referral»). Утгыг админ тохируулна (`SettingKey`);
 * энд зөвхөн анхдагч утга ба тооцооны томьёо — API (бодит борлуулалт), landing, demo бүгд эндээс уншина.
 */

/** `GET /catalog/money-rules` — нийтэд харуулах (landing тооцоолуур, шимтгэлийн тайлбар). */
export interface MoneyRules {
  /** 1 кредит = ? ₮ */
  creditPriceMnt: number;
  /** Платформын өөрийн суралцагчаас авах шимтгэл (%) */
  commissionPlatformPercent: number;
  /** Багшийн referral-аар ирсэн суралцагчаас авах шимтгэл (%) */
  commissionReferralPercent: number;
}

export const DEFAULT_MONEY_RULES: Readonly<MoneyRules> = {
  creditPriceMnt: 1000,
  commissionPlatformPercent: 40,
  commissionReferralPercent: 10,
};

/**
 * Борлуулалтын орлого (₮): зарцуулсан кредит × кредитийн ₮ үнэ × (1 − шимтгэл). Бүхэл тоогоор:
 * `gross = credits × creditPriceMnt`, `amount = floor(gross × (100 − commission%) / 100)`.
 */
export function saleEarning(
  credits: number,
  creditPriceMnt: number,
  commissionPercent: number,
): { grossMnt: number; amountMnt: number } {
  const grossMnt = credits * creditPriceMnt;
  const amountMnt = Math.floor((grossMnt * (100 - commissionPercent)) / 100);
  if (!Number.isSafeInteger(grossMnt) || grossMnt > 2_147_483_647) throw new Error('Earning amount overflow');
  return { grossMnt, amountMnt };
}
