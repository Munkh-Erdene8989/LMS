'use client';

import type { AuthUser } from '@lms/shared';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, isUnauthorized } from './client-api';

/**
 * Одоогийн үзэгч ("хэн нэвтэрсэн бэ") — `/me`-г root layout-д НЭГ удаа (route солигдох бүрт) уншина.
 * Header, admin/teacher shell, хуудсууд эндээс уншина; өөрсдөө `/me` дуудахгүй.
 *
 * - `loading` — анхны уншилт явж байна (дараагийн route-д өмнөх утга хэвээр — flicker-гүй).
 * - `guest`   — 401 (refresh ч бүтээгүй).
 * - `error`   — сүлжээ / 5xx: нэвтэрсэн эсэх тодорхойгүй.
 * Эрхийн бодит шалгалт API дээр — энэ нь зөвхөн UX.
 */
export type Viewer =
  | { status: 'loading'; user: null }
  | { status: 'guest'; user: null }
  | { status: 'error'; user: null }
  | { status: 'authed'; user: AuthUser };

interface ViewerContextValue {
  viewer: Viewer;
  /** Профайл засах, logout зэрэг үйлдлийн дараа шинэчлэх (`null` = гарсан). */
  setUser: (user: AuthUser | null) => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer>({ status: 'loading', user: null });

  useEffect(() => {
    let alive = true;
    api<AuthUser>('/me')
      .then((r) => alive && setViewer({ status: 'authed', user: r.data }))
      .catch((err: unknown) => alive && setViewer({ status: isUnauthorized(err) ? 'guest' : 'error', user: null }));
    return () => {
      alive = false;
    };
  }, [pathname]);

  const setUser = useCallback(
    (user: AuthUser | null) => setViewer(user ? { status: 'authed', user } : { status: 'guest', user: null }),
    [],
  );

  return <ViewerContext.Provider value={{ viewer, setUser }}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error('useViewer: ViewerProvider-гүй');
  return ctx;
}

/** Нэвтэрсэн үзэгч тухайн role-той эсэх. */
export function hasRole(viewer: Viewer, role: AuthUser['roles'][number]): boolean {
  return viewer.status === 'authed' && viewer.user.roles.includes(role);
}
