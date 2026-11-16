import type { HealthResponse } from '@lms/shared';

/** Server талаас API руу хандах хаяг. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}
