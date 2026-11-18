'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './toast.module.css';

export type ToastKind = 'info' | 'error';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  leaving: boolean;
}

export interface ToastApi {
  /** Амжилт/мэдээлэл: «Авлаа: <нэр>». */
  toast: (message: string) => void;
  /** Алдаа: юу болсон + яаж засах. `role="alert"`. */
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_TOASTS = 3;
const LIFETIME_MS = 3200;
const LEAVE_MS = 280;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const handle = setTimeout(() => {
      timers.current.delete(handle);
      fn();
    }, ms);
    timers.current.add(handle);
  }, []);

  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const h of set) clearTimeout(h);
      set.clear();
    };
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, message, kind, leaving: false }].slice(-MAX_TOASTS));
      later(() => {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
        later(() => setItems((prev) => prev.filter((x) => x.id !== id)), LEAVE_MS);
      }, LIFETIME_MS);
    },
    [later],
  );

  const api = useMemo<ToastApi>(() => ({ toast: (m) => push(m, 'info'), error: (m) => push(m, 'error') }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* data-ui-live: Dialog нээлттэй үед ч toast inert болохгүй */}
      <div className={styles.region} role="status" aria-live="polite" data-ui-live="">
        {items.map((x) => (
          <div
            key={x.id}
            className={[styles.toast, x.kind === 'error' && styles.error, x.leaving && styles.out].filter(Boolean).join(' ')}
            role={x.kind === 'error' ? 'alert' : undefined}
          >
            {x.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast: <ToastProvider> дотор ашиглана');
  return ctx;
}
