import type { ApiErrorBody, PublicLessonContent } from '@lms/shared';

/**
 * API хариуг уншихад browser (`client-api.ts`) ба SSR (`catalog.ts`) adapter-ын хуваалцах хэсэг:
 * body задлах, хоосон payload илрүүлэх, түр demo (ticket 33b) орлуулалт.
 *
 * Demo-гийн gate: функц бүр флагийг ЭНД шууд `process.env.NEXT_PUBLIC_DEMO_DATA`-аар шалгана — bundler build үед
 * `false` болгож, салбар доторх динамик import-ийг (demo модуль бүхэлдээ) bundle-аас хасна. `DEMO_ENABLED` тогтмолыг
 * модуль хооронд import хийвэл тогтмол шингээлт хийгддэггүй тул dead-code болохгүй — тиймээс шалгалт функц дотроо.
 */

/** Body-г JSON гэж уншина. Proxy/gateway HTML буцааж болно — JSON биш эсвэл хоосон бол `null` (SyntaxError шидэхгүй). */
export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Хоосон жагсаалт / `items` нь хоосон хуудас — demo build-д fixture-ээр орлуулах дохио. */
export function isEmptyPayload(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return Array.isArray(items) && items.length === 0;
  }
  return false;
}

/** GET-ийн demo fixture (флаггүй build-д үргэлж `undefined`). */
export async function demoRead<T>(path: string): Promise<T | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { demoFor } = await import('./demo');
    return demoFor(path) as T | undefined;
  }
  return undefined;
}

/** `demo-` хичээлийн fixture (флаггүй build-д үргэлж `undefined`). */
export async function demoLessonRead(id: string): Promise<PublicLessonContent | 'locked' | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { demoLesson } = await import('./demo');
    return demoLesson(id);
  }
  return undefined;
}

/** `demo-` ID-тай mutation-д буцаах алдаа (флаггүй build-д үргэлж `undefined`). */
export async function demoMutationError(path: string, body: unknown): Promise<ApiErrorBody | undefined> {
  if (process.env.NEXT_PUBLIC_DEMO_DATA === '1') {
    const { isDemoMutation, DEMO_MUTATION_MESSAGE } = await import('./demo');
    return isDemoMutation(path, body) ? { code: 'DEMO_READONLY', message: DEMO_MUTATION_MESSAGE } : undefined;
  }
  return undefined;
}
