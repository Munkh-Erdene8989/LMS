import type { SettingKey, SettingUnit } from '@lms/shared';

export interface IntSettingDefinition {
  default: number;
  min: number;
  max: number;
  unit: SettingUnit;
}

/**
 * Платформын тохиргооны цорын ганц тодорхойлолт. Бүх утга бүхэл тоо (мөнгө ₮, хувь, хоног).
 * DB-д мөр байхгүй бол `default` хэрэглэгдэнэ. Шинэ тохиргоо: энд нэмж, `SettingKey`-д нэмнэ.
 */
export const SETTINGS: Record<SettingKey, IntSettingDefinition> = {
  /** 1 кредит = ? ₮ */
  creditPriceMnt: { default: 1000, min: 1, max: 1_000_000, unit: 'MNT' },
  /** Платформын өөрийн суралцагчаас авах шимтгэл */
  commissionPlatformPercent: { default: 40, min: 0, max: 100, unit: 'PERCENT' },
  /** Багшийн referral-аар ирсэн суралцагчаас авах шимтгэл */
  commissionReferralPercent: { default: 10, min: 0, max: 100, unit: 'PERCENT' },
  /** Referral attribution хүчинтэй хугацаа */
  referralWindowDays: { default: 30, min: 1, max: 365, unit: 'DAYS' },
  /** Payout хүсэх доод босго */
  payoutMinimumMnt: { default: 50_000, min: 0, max: 100_000_000, unit: 'MNT' },
  /** Кредит lot-ын хүчинтэй хугацаа */
  creditValidityMonths: { default: 12, min: 1, max: 120, unit: 'MONTHS' },
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}
