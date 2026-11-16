import { createHmac, timingSafeEqual } from 'node:crypto';

/** HS256 JWT — гадны сан шаардлагагүй, зөвхөн бидний өөрсдийн access token-д. */
export interface AccessClaims {
  sub: string;
  /** User.tokenVersion — "бүх төхөөрөмжөөс гарах" үед хүчингүй болгоход */
  ver: number;
  iat: number;
  exp: number;
}

const b64 = (input: string) => Buffer.from(input).toString('base64url');
const HEADER = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function signJwt(claims: Omit<AccessClaims, 'iat' | 'exp'>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds }));
  const sig = createHmac('sha256', secret).update(`${HEADER}.${payload}`).digest('base64url');
  return `${HEADER}.${payload}.${sig}`;
}

/** Хүчинтэй бол claims, үгүй бол null. */
export function verifyJwt(token: string, secret: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  if (header !== HEADER) return null;
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AccessClaims;
    if (typeof claims.sub !== 'string' || typeof claims.ver !== 'number' || typeof claims.exp !== 'number') {
      return null;
    }
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
