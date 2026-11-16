import type { IdentifierType } from '@lms/db';

/** Монгол дугаар: 8 оронтой, `+976`/`976` угтвартай байж болно. Хадгалах хэлбэр: `+976XXXXXXXX`. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  const m = /^(?:\+?976)?(\d{8})$/.exec(digits);
  return m ? `+976${m[1]}` : null;
}

/** verify.mn-д илгээх 8 оронтой хэлбэр */
export function localPhone(normalized: string): string {
  return normalized.replace(/^\+976/, '');
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeIdentifier(type: IdentifierType, value: string): string | null {
  return type === 'PHONE' ? normalizePhone(value) : normalizeEmail(value);
}
