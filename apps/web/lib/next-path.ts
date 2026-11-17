/** `?next=` буцах зам — зөвхөн энэ сайтын дотоод зам (open redirect-ээс сэргийлнэ). */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return raw.slice(0, 500);
}

/** Одоогийн хуудас руу буцах `?next=` бүхий холбоос. */
export function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(next)}`;
}
