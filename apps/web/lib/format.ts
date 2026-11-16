/** Тоо, огноог монгол хэлбэрээр. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('mn-MN').format(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('mn-MN', { dateStyle: 'medium', timeStyle: 'short' });
}
