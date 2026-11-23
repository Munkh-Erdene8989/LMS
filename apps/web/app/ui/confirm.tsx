'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { Button } from './button';
import { Dialog, DialogActions } from './dialog';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Үндсэн товчны текст (default «Батлах»). Тодорхой үйл үг өгөх. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Устгах/буцаах боломжгүй үйлдэл: товч улаан, анхны focus «Болих» дээр. */
  danger?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const confirm = useCallback<ConfirmFn>((options) => {
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(value);
  }, []);

  useEffect(
    () => () => {
      pendingRef.current?.resolve(false);
    },
    [],
  );

  const opts = pending?.options;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onClose={() => settle(false)} title={opts?.title ?? ''} description={opts?.body}>
        <DialogActions>
          <Button variant="secondary" data-autofocus={opts?.danger ? '' : undefined} onClick={() => settle(false)}>
            {opts?.cancelLabel ?? t('ui.cancel')}
          </Button>
          <Button variant={opts?.danger ? 'danger' : 'primary'} data-autofocus={opts?.danger ? undefined : ''} onClick={() => settle(true)}>
            {opts?.confirmLabel ?? t('ui.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({ title, danger: true })) …` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm: <ConfirmProvider> дотор ашиглана');
  return ctx;
}
