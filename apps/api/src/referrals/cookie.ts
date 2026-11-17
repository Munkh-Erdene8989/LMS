import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import type { Env } from '../env';

/** Нэвтрээгүй зочны referral — `<teacherId>.<visitedAtMs>.<hmac>` (гараар засаж хугацаа сунгах боломжгүй). */
export const REFERRAL_COOKIE = 'lms_ref';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sign(secret: string, teacherId: string, visitedAtMs: number): string {
  return createHmac('sha256', secret).update(`ref:${teacherId}:${visitedAtMs}`).digest('base64url');
}

export function encodeReferralCookie(secret: string, teacherId: string, visitedAt: Date): string {
  const ms = visitedAt.getTime();
  return `${teacherId}.${ms}.${sign(secret, teacherId, ms)}`;
}

/** Гарын үсэг зөв бол `{ teacherId, visitedAt }`, үгүй бол null. Хугацааг (window) дуудагч шалгана. */
export function decodeReferralCookie(
  secret: string,
  value: string | undefined,
  now: Date,
): { teacherId: string; visitedAt: Date } | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [teacherId, msRaw, sig] = parts as [string, string, string];
  if (!UUID.test(teacherId) || !/^\d{1,15}$/.test(msRaw)) return null;
  const ms = Number(msRaw);
  const expected = Buffer.from(sign(secret, teacherId, ms));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  // Ирээдүйн огноог (цагийн зөрүү) одоогоор хязгаарлана.
  return { teacherId, visitedAt: new Date(Math.min(ms, now.getTime())) };
}

export function setReferralCookie(
  res: Response,
  env: Pick<Env, 'NODE_ENV' | 'JWT_SECRET'>,
  teacherId: string,
  visitedAt: Date,
  windowDays: number,
): void {
  res.cookie(REFERRAL_COOKIE, encodeReferralCookie(env.JWT_SECRET, teacherId, visitedAt), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: windowDays * 86_400_000,
  });
}
