import type { SubscriptionStatus } from '@lms/db';
import { SubscriptionErrors as E } from './errors';

/**
 * Subscription-ийн төлөвийн машин — цорын ганц эх сурвалж.
 *
 * ```
 *  (байхгүй) ─start→ INCOMPLETE ─төлбөр→ ACTIVE ─сунгалт амжилттай→ ACTIVE
 *                                          └─сунгалт төлөгдөөгүй→ PAST_DUE ─төлбөр→ ACTIVE
 *                                                                    └─3 хоног→ PAUSED
 *  cancel:     INCOMPLETE | ACTIVE | PAST_DUE | PAUSED → CANCELED
 *  reactivate: PAUSED | CANCELED ─төлбөр (шинэ үе тэр мөчөөс)→ ACTIVE
 * ```
 */
export const TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  INCOMPLETE: ['ACTIVE', 'CANCELED'],
  ACTIVE: ['ACTIVE', 'PAST_DUE', 'CANCELED'],
  PAST_DUE: ['ACTIVE', 'PAUSED', 'CANCELED'],
  PAUSED: ['ACTIVE', 'CANCELED'],
  CANCELED: ['ACTIVE'],
};

/** Хэрэглэгчийн үйлдэл аль төлвөөс зөвшөөрөгдөх (`start` нь subscription байхгүй үед ч). */
export const USER_ACTIONS = {
  /** Багц сонгож төлбөр эхлүүлэх (анх, эсвэл өөр багцаар дахин) */
  start: ['INCOMPLETE', 'PAUSED', 'CANCELED'],
  /** Ижил багцаар дахин идэвхжүүлэх */
  reactivate: ['PAUSED', 'CANCELED'],
  cancel: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'PAUSED'],
  /** Хугацаа хэтэрсэн сунгалтыг нэхэмжлэхээр төлөх */
  pay: ['PAST_DUE'],
} as const satisfies Record<string, readonly SubscriptionStatus[]>;

export type UserAction = keyof typeof USER_ACTIONS;

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!canTransition(from, to)) throw E.invalidTransition(from, to);
}

export function assertAction(action: UserAction, status: SubscriptionStatus): void {
  if (!(USER_ACTIONS[action] as readonly SubscriptionStatus[]).includes(status)) throw E.invalidAction(action, status);
}

/** Төлөгдөөгүй сунгалт PAST_DUE-ээс PAUSED болох хүртэлх хугацаа (хоног) */
export const GRACE_DAYS = 3;
