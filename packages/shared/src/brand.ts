/**
 * Брэндийн цорын ганц эх сурвалж. Нэр, домэйн шийдэгдэхэд зөвхөн энд солино.
 */
export const BRAND = {
  /** Кодонд ашиглах түр нэр */
  slug: 'lms',
  /** Хэрэглэгчид харагдах нэр */
  name: 'LMS',
  /** Анхдагч хэл */
  defaultLocale: 'mn',
} as const;

export type Brand = typeof BRAND;
