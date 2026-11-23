import type { NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';

/**
 * Browser → `/api/*` → API proxy (auth cookie first-party, `COOKIE_PATH_PREFIX=/api`).
 *
 * Яагаад `next.config` rewrite биш: Vercel-ийн гадны rewrite нь Railway-д Европын edge-ээр (cdg1) орж ирдэг байсан тул
 * Сингапурын API хүртэл хүсэлт бүр ~0.4с нэмэгддэг. Энэ handler function-ийн бүсээс (vercel.json `regions`) шууд дуудна.
 *
 * IP: Vercel `x-forwarded-for`-ийг client IP-ээр солиж өгдөг; бид үүнийг дамжуулж, Railway edge function-ий IP-г нэмнэ →
 * API-ийн `TRUST_PROXY=2` өмнөх rewrite-тэй адил client IP-г олно.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hop-by-hop ба fetch өөрөө тооцох header-үүд. */
const DROP_REQUEST = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'content-length', 'accept-encoding', 'upgrade', 'te', 'trailer', 'proxy-connection']);
/** Node fetch body-г задалсан тул encoding/length-ийг буцааж дамжуулахгүй; set-cookie-г тусад нь. */
const DROP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key)) headers.set(key, value);
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ message: 'API unreachable' }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key)) out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);

  return new Response(req.method === 'HEAD' ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS, proxy as HEAD };
