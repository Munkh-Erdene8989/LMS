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
  const send = () =>
    fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshOnce())) {
    res = await send();
  }

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new ApiRequestError(res.status, json as ApiErrorBody | null);
  return { status: res.status, data: json as T };
}
