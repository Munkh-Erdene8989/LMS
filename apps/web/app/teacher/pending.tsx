'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AssignmentInboxPage } from '@lms/shared';
import { api } from '@/lib/client-api';

/** Шалгаагүй даалгаврын тоо; `null` — ачаалж байна эсвэл алдаа (badge харуулахгүй). */
const UnreviewedContext = createContext<number | null>(null);

/**
 * Layout нэг удаа татаж, цэсний badge болон тойм хуудас хуваалцана. `refreshKey` (pathname) солигдох бүрт
 * дахин татна — даалгавар шалгаад өөр хуудас руу шилжихэд тоо шинэчлэгдэнэ.
 */
export function UnreviewedProvider({ enabled, refreshKey, children }: { enabled: boolean; refreshKey: string; children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api<AssignmentInboxPage>('/teacher/assignments?status=UNREVIEWED&limit=1')
      .then((r) => alive && setCount(r.data.unreviewedCount))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled, refreshKey]);

  return <UnreviewedContext.Provider value={count}>{children}</UnreviewedContext.Provider>;
}

export function useUnreviewed(): number | null {
  return useContext(UnreviewedContext);
}
