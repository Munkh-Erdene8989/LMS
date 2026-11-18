import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/csp';

/**
 * Хүсэлт бүрт шинэ nonce үүсгэж CSP тавина (Next.js 15 стандарт хэлбэр). CSP-г request header-д ч тавьдаг нь
 * Next.js-д nonce-ийг уншиж, өөрийн script tag-уудад автоматаар хавсаргах боломж олгоно.
 * Nonce хүсэлт бүр өөр тул nonce-тэй хуудас статик cache хийгдэхгүй (dynamic render) — app/layout.tsx.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'production');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // /api/* (API proxy, өөрийн helmet header-тэй), статик asset, prefetch-ийг оруулахгүй.
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
