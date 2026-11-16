import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../env';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_PATH_PREFIX'>;

/**
 * Browser зөвхөн web домэйнтэй харилцаж, API руу web-ийн `/api/*` proxy-оор хүрдэг тул
 * cookie first-party — `SameSite=Lax` хангалттай (Safari гэх мэт third-party cookie блоклодог).
 * Access cookie `/` дээр (web-ийн server render ч уншина), refresh cookie зөвхөн auth замд.
 */
function baseOptions(env: CookieEnv): CookieOptions {
  return { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' };
}

const refreshPath = (env: CookieEnv) => `${env.COOKIE_PATH_PREFIX}/auth`;

export function setAuthCookies(res: Response, env: CookieEnv, access: string, refresh: string): void {
  const base = baseOptions(env);
  res.cookie(ACCESS_COOKIE, access, { ...base, path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...base, path: refreshPath(env), maxAge: REFRESH_TTL_SECONDS * 1000 });
}

export function clearAuthCookies(res: Response, env: CookieEnv): void {
  const base = baseOptions(env);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: refreshPath(env) });
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
