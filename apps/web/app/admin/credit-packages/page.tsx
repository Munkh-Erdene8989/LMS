'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CreditAdjustResult, CreditPackageView } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { ErrorLine, LoadingRows, errorText } from '../admin-ui';
import styles from '../admin.module.css';

type Draft = Omit<CreditPackageView, 'id'>;

const EMPTY: Draft = { name: '', credits: 10, priceMnt: 10_000, active: true, isTest: false, position: 0 };

export default function AdminCreditPackagesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<CreditPackageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<CreditPackageView[]>('/admin/credit-packages')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => setError(errorText(err)));

  useEffect(() => {
    void load();
  }, []);

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  return (
    <div className={styles.stackLg}>
      <h1 className={styles.title}>{t('credits.adminTitle')}</h1>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.map((p) => (
        <PackageForm
          key={p.id}
          initial={p}
          submitLabel={t('credits.save')}
          onSubmit={(d) => run(() => api(`/admin/credit-packages/${p.id}`, { method: 'PATCH', body: d }))}
          onRemove={async () => {
            const ok = await confirm({ title: t('credits.removeConfirm'), body: p.name, confirmLabel: t('credits.remove'), danger: true });
            if (ok) await run(() => api(`/admin/credit-packages/${p.id}`, { method: 'DELETE' }));
          }}
        />
      ))}
      {items && (
        <PackageForm
          initial={EMPTY}
          submitLabel={t('credits.add')}
          resetOnSuccess
          onSubmit={(d) => run(() => api('/admin/credit-packages', { method: 'POST', body: d }))}
        />
      )}
      <AdjustForm />
    </div>
  );
}

function PackageForm({
  initial,
  submitLabel,
  onSubmit,
  onRemove,
  resetOnSuccess,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<boolean>;
  onRemove?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { name, credits, priceMnt, active, isTest, position } = d;
    setSaving(true);
    const ok = await onSubmit({ name, credits, priceMnt, active, isTest, position });
    setSaving(false);
    if (ok && resetOnSuccess) setD(initial);
  }

  return (
    <form className={`${styles.item} ${styles.fieldGrid}`} onSubmit={submit}>
      <label className={styles.field}>
        {t('credits.name')}
        <input className="input" required maxLength={100} value={d.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className={styles.field}>
        {t('credits.credits')}
        <input className="input" type="number" inputMode="numeric" min={1} required value={d.credits} onChange={(e) => set('credits', Number(e.target.value))} />
      </label>
      <label className={styles.field}>
        {t('credits.priceMnt')}
        <input className="input" type="number" inputMode="numeric" min={1} required value={d.priceMnt} onChange={(e) => set('priceMnt', Number(e.target.value))} />
      </label>
      <label className={styles.field}>
        {t('credits.position')}
        <input className="input" type="number" inputMode="numeric" min={0} value={d.position} onChange={(e) => set('position', Number(e.target.value))} />
      </label>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
        {t('credits.active')}
      </label>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={d.isTest} onChange={(e) => set('isTest', e.target.checked)} />
        {t('credits.isTest')}
      </label>
      <small className={styles.muted}>
        {d.credits > 0 && t('credits.perCredit', { price: formatNumber(Math.round(d.priceMnt / d.credits)) })}
      </small>
      <span className={styles.rowActions}>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        {onRemove && (
          <Button variant="ghost" onClick={onRemove}>
            {t('credits.remove')}
          </Button>
        )}
      </span>
    </form>
  );
}

/** Түр зуурын хялбар хэлбэр — хэрэглэгчийн бүрэн удирдлага ticket 22-т. */
function AdjustForm() {
  const [user, setUser] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const r = await api<CreditAdjustResult>('/admin/credits/adjust', {
        method: 'POST',
        body: { user, delta: Number(delta), reason },
      });
      setStatus({ ok: true, text: t('credits.adjustDone', { balance: formatNumber(r.data.balance) }) });
      setDelta('');
      setReason('');
    } catch (err) {
      setStatus({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.item} aria-labelledby="credits-adjust-title">
      <h2 id="credits-adjust-title" className={styles.subtitle}>
        {t('credits.adjustTitle')}
      </h2>
      <form onSubmit={submit} className={styles.stack}>
        <input className="input" required autoComplete="off" placeholder={t('credits.adjustUser')} aria-label={t('credits.adjustUser')} value={user} onChange={(e) => setUser(e.target.value)} />
        <input
          className="input"
          type="number"
          inputMode="numeric"
          required
          step={1}
          placeholder={t('credits.adjustDelta')}
          aria-label={t('credits.adjustDelta')}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <input
          className="input"
          required
          minLength={3}
          maxLength={500}
          autoComplete="off"
          placeholder={t('credits.adjustReason')}
          aria-label={t('credits.adjustReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div>
          <Button type="submit" loading={busy}>
            {t('credits.adjustSubmit')}
          </Button>
        </div>
        {status && (status.ok ? <p className={styles.info} role="status">{status.text}</p> : <ErrorLine>{status.text}</ErrorLine>)}
      </form>
    </section>
  );
}
