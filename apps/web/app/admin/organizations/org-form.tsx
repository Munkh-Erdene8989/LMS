'use client';

import { useState, type FormEvent } from 'react';
import { isoToUbLocal, ubLocalToIso, type OrgAdminRow } from '@lms/shared';
import { t } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { ErrorLine, errorText } from '../admin-ui';
import styles from '../admin.module.css';

export interface OrgDraft {
  name: string;
  active: boolean;
  /** `YYYY-MM-DD` (Улаанбаатарын цаг, тухайн өдрийн төгсгөл хүртэл) */
  contractDate: string;
  seatLimit: number;
}

export function draftFromRow(row: OrgAdminRow): OrgDraft {
  return { name: row.name, active: row.active, contractDate: isoToUbLocal(row.contractEndsAt).slice(0, 10), seatLimit: row.seatLimit };
}

export function emptyDraft(): OrgDraft {
  const next = new Date(Date.now() + 365 * 24 * 60 * 60_000);
  return { name: '', active: true, contractDate: next.toISOString().slice(0, 10), seatLimit: 10 };
}

/** API-ийн body: гэрээ нь сонгосон өдрийн 23:59 (Улаанбаатарын цаг). */
export function draftBody(d: OrgDraft) {
  return {
    name: d.name.trim(),
    active: d.active,
    seatLimit: d.seatLimit,
    contractEndsAt: ubLocalToIso(`${d.contractDate}T23:59`) ?? undefined,
  };
}

/** Байгууллага үүсгэх / засах (нэр, идэвхтэй, гэрээ дуусах огноо, суудал). `onSubmit` алдаа шидвэл энд харуулна. */
export function OrgForm({
  initial,
  submitLabel,
  onSubmit,
  confirmDeactivate,
}: {
  initial: OrgDraft;
  submitLabel: string;
  onSubmit: (d: OrgDraft) => Promise<void>;
  /** Идэвхтэй -> идэвхгүй болгохын өмнө баталгаажуулна */
  confirmDeactivate?: () => Promise<boolean>;
}) {
  const [d, setD] = useState<OrgDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof OrgDraft>(k: K, v: OrgDraft[K]) => {
    setSaved(false);
    setD((prev) => ({ ...prev, [k]: v }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (initial.active && !d.active && confirmDeactivate && !(await confirmDeactivate())) return;
    setSaving(true);
    try {
      await onSubmit(d);
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`${styles.item} ${styles.fieldGrid}`} onSubmit={submit}>
      <label className={styles.field}>
        {t('orgAdmin.name')}
        <input className="input" required maxLength={200} value={d.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className={styles.field}>
        {t('orgAdmin.contractEndsAt')}
        <input className="input" type="date" required value={d.contractDate} onChange={(e) => set('contractDate', e.target.value)} />
      </label>
      <label className={styles.field}>
        {t('orgAdmin.seatLimit')}
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          required
          value={d.seatLimit}
          onChange={(e) => set('seatLimit', Number(e.target.value))}
        />
      </label>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
        {t('orgAdmin.active')}
      </label>
      <span className={styles.rowActions}>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </span>
      {error && <ErrorLine>{error}</ErrorLine>}
      {saved && (
        <p className={styles.info} role="status">
          {t('orgAdmin.saved')}
        </p>
      )}
    </form>
  );
}
