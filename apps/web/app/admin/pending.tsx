'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AdminOverview, AdminPendingCounts } from '@lms/shared';
import { api } from '@/lib/client-api';

/** `null` — ачаалж байна эсвэл алдаа (badge харуулахгүй, хуудас ажилласаар). */
const PendingContext = createContext<AdminPendingCounts | null>(null);

/**
 * Хүлээгдэж буй ажлын тоо: layout нэг удаа татаж, цэсний badge болон тойм хуудас хуваалцана.
 * `refreshKey` (pathname) солигдох бүрт дахин татна — шийдвэр гаргаад өөр хуудас руу шилжихэд тоо шинэчлэгдэнэ.
 */
export function PendingProvider({ refreshKey, children }: { refreshKey: string; children: ReactNode }) {
  const [counts, setCounts] = useState<AdminPendingCounts | null>(null);

  useEffect(() => {
    let alive = true;
    api<AdminOverview>('/admin/overview')
      .then((r) => alive && setCounts(r.data.pending))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return <PendingContext.Provider value={counts}>{children}</PendingContext.Provider>;
}

export function usePending(): AdminPendingCounts | null {
  return useContext(PendingContext);
}

export function totalPending(c: AdminPendingCounts | null): number {
  return c ? c.teacherApplications + c.courseReviews + c.payouts + c.paymentIssues : 0;
}
