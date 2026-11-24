'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { Button } from '../ui/button';
import { Dialog, DialogActions } from '../ui/dialog';
import { Skeleton } from '../ui/skeleton';
import styles from './admin.module.css';

export { errorText } from '@/lib/client-api';

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.error}>
      {children}
    </p>
  );
}

/** Ачаалж байх үеийн skeleton (текст «Ачаалж байна…» оронд). */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label={t('ui.loading')} className={styles.stack}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={44} radius={12} />
      ))}
    </div>
  );
}

export function Pill({ tone = 'ok', children }: { tone?: 'ok' | 'err' | 'warn' | 'neutral'; children: ReactNode }) {
  const cls = [styles.pill, tone === 'err' && styles.pillErr, tone === 'warn' && styles.pillWarn, tone === 'neutral' && styles.pillNeutral]
    .filter(Boolean)
    .join(' ');
  return <span className={cls}>{children}</span>;
}

export interface TabItem<K extends string> {
  key: K;
  label: string;
}

/** Табын мөр: `aria-pressed` товчнууд (панелтай tablist биш, тиймээс role=tab ашиглахгүй). */
export function FilterTabs<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className={styles.tabs}>
      {items.map((i) => (
        <Button key={i.key} size="sm" variant={i.key === value ? 'primary' : 'secondary'} aria-pressed={i.key === value} onClick={() => onChange(i.key)}>
          {i.label}
        </Button>
      ))}
    </div>
  );
}

export interface ReasonDialogProps {
  open: boolean;
  onClose: () => void;
  /** Үйлдлийн нэр (гарчиг). */
  title: string;
  /** Нэмэлт тайлбар / баталгаажуулах өгүүлбэр. */
  description?: string;
  /** Талбарын label. */
  label: string;
  confirmLabel: string;
  danger?: boolean;
  minLength?: number;
  /** Талбарын анхны утга (жишээ нь нэр солих). */
  initialValue?: string;
  maxLength?: number;
  /** false бол нэг мөр input. */
  multiline?: boolean;
  /** Утга `trim` хийгдсэн. Алдааг дуудагч өөрөө барина. */
  onSubmit: (value: string) => void | Promise<void>;
}

/** Шалтгаан/тайлбар шаарддаг үйлдлийн Dialog form (window.prompt/confirm-ийн оронд). */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label,
  confirmLabel,
  danger,
  minLength = 1,
  initialValue = '',
  maxLength,
  multiline = true,
  onSubmit,
}: ReasonDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();
  const valid = trimmed.length >= minLength;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <form className={styles.dialogForm} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor={fieldId}>{label}</label>
          {multiline ? (
            <textarea
              id={fieldId}
              className={`input ${styles.textarea}`}
              rows={3}
              required={minLength > 0}
              maxLength={maxLength}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <input id={fieldId} className="input" required={minLength > 0} maxLength={maxLength} value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!valid} loading={busy}>
            {confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
