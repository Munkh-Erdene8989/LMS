'use client';

import type { ApiErrorBody } from '@lms/shared';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { demoMutationError, demoRead, isEmptyPayload, readJson } from './http';
import { t } from './i18n';
import { withNext } from './next-path';

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
      const demo = await demoRead<T>(path);
      if (demo !== undefined) return { status: 200, data: demo };
    }
    throw err;
  }

  const json = await readJson(res);
  if (isGet && (!res.ok || isEmptyPayload(json))) {
    const demo = await demoRead<T>(path);
    if (demo !== undefined) return { status: 200, data: demo };
  }
  if (!res.ok) throw new ApiRequestError(res.status, json as ApiErrorBody | null);
  return { status: res.status, data: json as T };
}

/** Файл татах (PDF, CSV г.м). `api`-тай адил 401 бол refresh хийгээд нэг удаа давтана; энгийн `<a href>` token дууссан үед 401 авна. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const send = () => fetch(`/api${path}`, { credentials: 'same-origin' });
  let res = await send();
  if (res.status === 401 && (await refreshOnce())) res = await send();
  if (!res.ok) throw new ApiRequestError(res.status, (await readJson(res)) as ApiErrorBody | null);
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

/** Нэвтрэлт дууссан (refresh ч бүтээгүй) алдаа мөн эсэх. */
export function isUnauthorized(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError && err.status === 401;
}

/** Алдааг хэрэглэгчид харуулах текст: API-ийн мессеж, эсвэл ерөнхий алдаа. */
export function errorText(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : t('auth.genericError');
}

/**
 * Хуудасны API алдааны нэг policy: 401 бол одоогийн хуудас руу буцах `?next=`-тэй login руу шилжүүлээд `null`,
 * бусад үед харуулах текстийг буцаана.
 *
 *   const fail = useApiFailure();
 *   api(...).catch((err) => { const msg = fail(err); if (msg) setError(msg); });
 */
export function useApiFailure(): (err: unknown) => string | null {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (err: unknown) => {
      if (isUnauthorized(err)) {
        router.replace(withNext('/login', pathname));
        return null;
      }
      return errorText(err);
    },
    [router, pathname],
  );
}
