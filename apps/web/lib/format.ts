import { t } from './i18n';

/** Тоо, огноо, мөнгө, кредитийг монгол хэлбэрээр. Intl инстанс module-level cache. */
const NBSP = ' ';
const MINUS = '−';

const numberFmt = new Intl.NumberFormat('mn-MN');
const mntFmt = new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 0 });
const ratingFmt = new Intl.NumberFormat('mn-MN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFmt = new Intl.DateTimeFormat('mn-MN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const relativeFmt = new Intl.RelativeTimeFormat('mn-MN', { numeric: 'auto' });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Intl-ийн бүлэглэгчийг (таслал / жирийн зай) NBSP болгоно → мөр таслагдахгүй. */
function groupNbsp(s: string): string {
  return s.replace(/[,   ]/g, NBSP);
}

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** `1 250 ₮` (NBSP, ₮ тооны ард, 0 орон). */
export function formatMnt(n: number): string {
  return `${groupNbsp(mntFmt.format(n))}${NBSP}₮`;
}

/** `12 кредит` (0 бол `0 кредит`; үнэ харуулахад formatPrice). */
export function formatCredits(n: number): string {
  return t('ui.credits', { count: groupNbsp(numberFmt.format(n)) }).replace(/ (?=кредит)/, NBSP);
}

/** Хичээл/курсийн үнэ: 0 бол «Үнэгүй». */
export function formatPrice(credits: number): string {
  return credits === 0 ? t('ui.free') : formatCredits(credits);
}

/** `+50` / `−20` (жинхэнэ минус тэмдэг), 0 → `0`. */
export function formatDelta(n: number): string {
  if (n > 0) return `+${groupNbsp(numberFmt.format(n))}`;
  if (n < 0) return `${MINUS}${groupNbsp(numberFmt.format(Math.abs(n)))}`;
  return '0';
}

/** `4,8` (1 орон, Intl). */
export function formatRating(n: number): string {
  return ratingFmt.format(n);
}

/** Сүүлийн 7 хоногт relative («3 цагийн өмнө»), түүнээс хуучныг бүтэн огноогоор. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diff = then - now;
  if (Math.abs(diff) >= WEEK_MS) return formatDate(iso);
  const abs = Math.abs(diff);
  if (abs < 60_000) return relativeFmt.format(0, 'second');
  if (abs < 3_600_000) return relativeFmt.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return relativeFmt.format(Math.round(diff / 3_600_000), 'hour');
  return relativeFmt.format(Math.round(diff / 86_400_000), 'day');
}
