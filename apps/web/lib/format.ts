import { isoToUbLocal } from '@lms/shared';
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
// Огноо/relative-ийг Intl-ээр хийхгүй: Chrome-ийн ICU-д `mn` locale байхгүй (en-US руу унадаг) тул server (Node, mn)
// ба client-ийн текст зөрж hydration алдаа гарна. Мөн цагийн бүсийг төхөөрөмжөөс биш Улаанбаатараар тогтооно.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Intl-ийн бүлэглэгчийг (таслал / жирийн зай) NBSP болгоно → мөр таслагдахгүй. */
function groupNbsp(s: string): string {
  return s.replace(/[,   ]/g, NBSP);
}

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

/** `2026 оны 11-р сарын 19 23:51` (Улаанбаатарын цаг; server, client ижил). */
export function formatDate(iso: string): string {
  const [date = '', time = ''] = isoToUbLocal(iso).split('T');
  const [y, m, d] = date.split('-');
  return t('ui.dateTime', { year: y ?? '', month: Number(m), day: Number(d), time });
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

/** Төгрөгийн өөрчлөлт: `+1 250 ₮` / `−20 ₮` (formatDelta + NBSP ₮). */
export function formatMntDelta(n: number): string {
  return `${formatDelta(n)}${NBSP}₮`;
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
  if (abs < 60_000) return t('ui.relNow');
  const [n, unit]: [number, 'Minute' | 'Hour' | 'Day'] =
    abs < 3_600_000 ? [Math.round(abs / 60_000), 'Minute'] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'Hour'] : [Math.round(abs / 86_400_000), 'Day'];
  if (unit === 'Day' && n === 1) return t(diff < 0 ? 'ui.relYesterday' : 'ui.relTomorrow');
  return t(diff < 0 ? `ui.relPast${unit}` : `ui.relFuture${unit}`, { count: n });
}
