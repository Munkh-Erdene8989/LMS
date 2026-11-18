'use client';

import type { ApiErrorBody } from '@lms/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }
  get code(): string | undefined {
    return this.body?.code;
  }
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

let refreshing: Promise<boolean> | null = null;

/** Access token дууссан үед нэг удаа refresh хийнэ; зэрэг ирсэн хүсэлтүүд нэг refresh-ийг хүлээнэ. */
function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Browser-оос API руу (web-ийн `/api` proxy-оор). 401 бол refresh хийгээд нэг удаа давтана. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const isGet = (init.method ?? 'GET') === 'GET';

  // Түр demo (ticket 33b): `demo-` ID-тай mutation амжилтгүй.
  if (!isGet) {
    const demoError = await demoMutationError(path, init.body);
    if (demoError) throw new ApiRequestError(400, demoError);
  }

  const send = () =>
    fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !path.startsWith('/auth/') && (await refreshOnce())) {
      res = await send();
    }
  } catch (err) {
    if (isGet) {
      const demo = await demoFallback<T>(path);
      if (demo !== undefined) return { status: 200, data: demo };
    }
    throw err;
  }

  const text = await res.text();
  // Proxy/gateway алдаа HTML буцааж болно — JSON биш бол body-гүй гэж үзнэ (SyntaxError шидэхгүй).
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (isGet && (!res.ok || isEmptyPayload(json))) {
    const demo = await demoFallback<T>(path);
    if (demo !== undefined) return { status: 200, data: demo };
  }
  if (!res.ok) throw new ApiRequestError(res.status, json as ApiErrorBody | null);
  return { status: res.status, data: json as T };
}

/**
 * Түр demo (ticket 33b). Флагийг шууд `process.env.NEXT_PUBLIC_DEMO_DATA`-аар шалгана → флаггүй build-д салбар,
 * тэр дотрох динамик import (demo модуль бүхэлдээ) bundle-аас хасагдана.
 */
async function demoFallback<T>(path: string): Promise<T | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { demoFor } = await import('./demo');
    return demoFor(path) as T | undefined;
  }
  return undefined;
}

async function demoMutationError(path: string, body: unknown): Promise<ApiErrorBody | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { isDemoMutation, DEMO_MUTATION_MESSAGE } = await import('./demo');
    return isDemoMutation(path, body) ? { code: 'DEMO_READONLY', message: DEMO_MUTATION_MESSAGE } : undefined;
  }
  return undefined;
}

/** Demo-д ашиглах: хоосон жагсаалт / `items` нь хоосон хуудас. */
function isEmptyPayload(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return Array.isArray(items) && items.length === 0;
  }
  return false;
}

/** Файл татах (PDF, CSV г.м). `api`-тай адил 401 бол refresh хийгээд нэг удаа давтана; энгийн `<a href>` token дууссан үед 401 авна. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const send = () => fetch(`/api${path}`, { credentials: 'same-origin' });
  let res = await send();
  if (res.status === 401 && (await refreshOnce())) res = await send();
  if (!res.ok) {
    const text = await res.text();
    throw new ApiRequestError(res.status, text ? (JSON.parse(text) as ApiErrorBody) : null);
  }
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
