import { DEFAULT_MONEY_RULES as MONEY, type SettingKey, type SettingUnit } from '@lms/shared';

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
  creditPriceMnt: { default: MONEY.creditPriceMnt, min: 1, max: 1_000_000, unit: 'MNT' },
  /** Платформын өөрийн суралцагчаас авах шимтгэл */
  commissionPlatformPercent: { default: MONEY.commissionPlatformPercent, min: 0, max: 100, unit: 'PERCENT' },
  /** Багшийн referral-аар ирсэн суралцагчаас авах шимтгэл */
  commissionReferralPercent: { default: MONEY.commissionReferralPercent, min: 0, max: 100, unit: 'PERCENT' },
  /** Referral attribution хүчинтэй хугацаа */
  referralWindowDays: { default: 30, min: 1, max: 365, unit: 'DAYS' },
  /** Payout хүсэх доод босго */
  payoutMinimumMnt: { default: 50_000, min: 0, max: 100_000_000, unit: 'MNT' },
  /** Кредит lot-ын хүчинтэй хугацаа */
  creditValidityMonths: { default: 12, min: 1, max: 120, unit: 'MONTHS' },
  /** Үнэлгээ бичихэд курсийн нийтлэгдсэн lesson-уудаас эзэмших доод хувь (SPEC: ≥30%) */
  reviewMinOwnedPercent: { default: 30, min: 0, max: 100, unit: 'PERCENT' },
  /** Сарын багцын сунгалтаас хэд хоногийн өмнө сануулах */
  subscriptionReminderDays: { default: 3, min: 1, max: 14, unit: 'DAYS' },
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}
