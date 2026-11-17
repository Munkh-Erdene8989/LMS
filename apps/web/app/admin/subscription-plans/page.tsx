'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { SubscriptionPlanView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

type Draft = Omit<SubscriptionPlanView, 'id'>;

const EMPTY: Draft = { name: '', priceMnt: 15_000, credits: 20, active: true, position: 0 };

function message(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : t('auth.genericError');
}

export default function AdminSubscriptionPlansPage() {
  const [items, setItems] = useState<SubscriptionPlanView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<SubscriptionPlanView[]>('/admin/subscription-plans')
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
      <h1 style={{ margin: 0 }}>{t('subscription.adminTitle')}</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>{t('subscription.adminHint')}</p>
      {error && <p style={{ color: 'var(--err)', margin: 0 }}>{error}</p>}
      {!items && <p>{t('me.loading')}</p>}
      {items?.map((p) => (
        <PlanForm
          key={p.id}
          initial={p}
          submitLabel={t('subscription.save')}
          onSubmit={(d) => run(() => api(`/admin/subscription-plans/${p.id}`, { method: 'PATCH', body: d }))}
          onRemove={() => {
            if (window.confirm(t('subscription.removeConfirm'))) {
              void run(() => api(`/admin/subscription-plans/${p.id}`, { method: 'DELETE' }));
            }
          }}
        />
      ))}
      {items && (
        <PlanForm
          initial={EMPTY}
          submitLabel={t('subscription.add')}
          resetOnSuccess
          onSubmit={(d) => run(() => api('/admin/subscription-plans', { method: 'POST', body: d }))}
        />
      )}
    </main>
  );
}

function PlanForm({
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
    const { name, priceMnt, credits, active, position } = d;
    if ((await onSubmit({ name, priceMnt, credits, active, position })) && resetOnSuccess) setD(initial);
  }

  return (
    <form className="card package-form" onSubmit={submit}>
      <label>
        {t('subscription.name')}
        <input className="input" required maxLength={100} value={d.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        {t('subscription.priceMnt')}
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
        {t('subscription.credits')}
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
        {t('subscription.position')}
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
        {t('subscription.active')}
      </label>
      <small style={{ color: 'var(--muted)' }}>
        {d.credits > 0 && t('subscription.perCredit', { price: formatNumber(Math.round(d.priceMnt / d.credits)) })}
      </small>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn">{submitLabel}</button>
        {onRemove && (
          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            {t('subscription.remove')}
          </button>
        )}
      </span>
    </form>
  );
}
