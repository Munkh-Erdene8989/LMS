import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { originAllowed } from './configure-app';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth/cookies';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Server-to-server дуудлагууд (хөтөч биш, Origin-гүй, өөрийн гарын үсэг/токентой) — CSRF шалгалтаас чөлөөлнө:
 * - Mux webhook: `/webhooks/mux` (mux-signature)
 * - QPay callback: `/payments/qpay/callback/:token`, `/payments/qpay/subscription-callback/:token` (таамаглашгүй токен)
 */
const EXEMPT_PREFIXES = ['/webhooks/', '/payments/qpay/'];

const hasSessionCookie = (req: Request): boolean => {
  const header = req.headers.cookie ?? '';
  return header.split(';').some((part) => {
    const name = part.trim().split('=')[0];
    return name === ACCESS_COOKIE || name === REFRESH_COOKIE;
  });
};

const refererOrigin = (referer: string): string | null => {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

/**
 * CSRF хамгаалалт (cookie-д суурилсан auth): POST/PUT/PATCH/DELETE хүсэлтийн Origin (эсвэл Referer) нь allowlist-д
 * (WEB_ORIGIN, PUBLIC_WEB_URL, CORS_ORIGINS) байх ёстой, үгүй бол 403 `CSRF_ORIGIN`.
 *
 * Origin ба Referer хоёулаа байхгүй үед: auth cookie БАЙХГҮЙ бол зөвшөөрнө (curl, server-to-server; cookie-гүй хүсэлтээр
 * хохирогчийн эрхээр юу ч хийж чадахгүй). Auth cookie БАЙВАЛ 403 — орчин үеийн хөтөч POST дээр Origin-ийг үргэлж илгээдэг,
 * Origin-гүй cookie-тэй хүсэлт нь хөтөчийн хүсэлт биш (эсвэл header-ийг зориуд арилгасан).
 * `Origin: null` (sandbox iframe, redirect) нь allowlist-д байхгүй тул татгалзана.
 */
export function csrfOriginGuard(allowlist: readonly string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!STATE_CHANGING.has(req.method)) return next();
    if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const candidate = origin ?? (referer ? refererOrigin(referer) ?? 'invalid' : undefined);

    if (candidate === undefined) {
      if (!hasSessionCookie(req)) return next();
    } else if (originAllowed(candidate, allowlist)) {
      return next();
    }
    res.status(403).json({ code: 'CSRF_ORIGIN', message: 'Хүсэлтийн origin зөвшөөрөгдөөгүй байна.' });
  };
}
