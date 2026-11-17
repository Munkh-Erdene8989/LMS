'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CreditAdjustResult, CreditPackageView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

type Draft = Omit<CreditPackageView, 'id'>;

const EMPTY: Draft = { name: '', credits: 10, priceMnt: 10_000, active: true, isTest: false, position: 0 };

function message(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : t('auth.genericError');
}

export default function AdminCreditPackagesPage() {
  const [items, setItems] = useState<CreditPackageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<CreditPackageView[]>('/admin/credit-packages')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => setError(message(err)));

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
      setError(message(err));
      return false;
    }
  }

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('credits.adminTitle')}</h1>
      {error && <p style={{ color: 'var(--err)', margin: 0 }}>{error}</p>}
      {!items && <p>{t('me.loading')}</p>}
      {items?.map((p) => (
        <PackageForm
          key={p.id}
          initial={p}
          submitLabel={t('credits.save')}
          onSubmit={(d) => run(() => api(`/admin/credit-packages/${p.id}`, { method: 'PATCH', body: d }))}
          onRemove={() => {
            if (window.confirm(t('credits.removeConfirm'))) {
              void run(() => api(`/admin/credit-packages/${p.id}`, { method: 'DELETE' }));
            }
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
    </main>
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
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { name, credits, priceMnt, active, isTest, position } = d;
    if ((await onSubmit({ name, credits, priceMnt, active, isTest, position })) && resetOnSuccess) setD(initial);
  }

  return (
    <form className="card package-form" onSubmit={submit}>
      <label>
        {t('credits.name')}
        <input className="input" required maxLength={100} value={d.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        {t('credits.credits')}
        <input
          className="input"
          type="number"
          min={1}
          required
          value={d.credits}
          onChange={(e) => set('credits', Number(e.target.value))}
        />
      </label>
      <label>
        {t('credits.priceMnt')}
        <input
          className="input"
          type="number"
          min={1}
          required
          value={d.priceMnt}
          onChange={(e) => set('priceMnt', Number(e.target.value))}
        />
      </label>
      <label>
        {t('credits.position')}
        <input
          className="input"
          type="number"
          min={0}
          value={d.position}
          onChange={(e) => set('position', Number(e.target.value))}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
        {t('credits.active')}
      </label>
      <label className="check">
        <input type="checkbox" checked={d.isTest} onChange={(e) => set('isTest', e.target.checked)} />
        {t('credits.isTest')}
      </label>
      <small style={{ color: 'var(--muted)' }}>
        {d.credits > 0 && t('credits.perCredit', { price: formatNumber(Math.round(d.priceMnt / d.credits)) })}
      </small>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn">{submitLabel}</button>
        {onRemove && (
          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            {t('credits.remove')}
          </button>
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
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      const r = await api<CreditAdjustResult>('/admin/credits/adjust', {
        method: 'POST',
        body: { user, delta: Number(delta), reason },
      });
      setStatus(t('credits.adjustDone', { balance: formatNumber(r.data.balance) }));
      setDelta('');
      setReason('');
    } catch (err) {
      setStatus(message(err));
    }
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{t('credits.adjustTitle')}</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
        <input
          className="input"
          required
          placeholder={t('credits.adjustUser')}
          aria-label={t('credits.adjustUser')}
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <input
          className="input"
          type="number"
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
          placeholder={t('credits.adjustReason')}
          aria-label={t('credits.adjustReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="btn">{t('credits.adjustSubmit')}</button>
        {status && <p style={{ margin: 0 }}>{status}</p>}
      </form>
    </section>
  );
}
