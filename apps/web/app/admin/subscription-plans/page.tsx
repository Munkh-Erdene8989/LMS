'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { SubscriptionPlanView } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatMnt, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { ErrorLine, LoadingRows, errorText } from '../admin-ui';
import styles from '../admin.module.css';

type Draft = Omit<SubscriptionPlanView, 'id'>;

const EMPTY: Draft = { name: '', priceMnt: 15_000, credits: 20, active: true, position: 0 };

export default function AdminSubscriptionPlansPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<SubscriptionPlanView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<SubscriptionPlanView[]>('/admin/subscription-plans')
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
      <h1 className={styles.title}>{t('subscription.adminTitle')}</h1>
      <p className={styles.hint}>{t('subscription.adminHint')}</p>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.map((p) => (
        <PlanForm
          key={p.id}
          initial={p}
          submitLabel={t('subscription.save')}
          onSubmit={(d) => run(() => api(`/admin/subscription-plans/${p.id}`, { method: 'PATCH', body: d }))}
          onRemove={async () => {
            const ok = await confirm({ title: t('subscription.removeConfirm'), body: p.name, confirmLabel: t('subscription.remove'), danger: true });
            if (ok) await run(() => api(`/admin/subscription-plans/${p.id}`, { method: 'DELETE' }));
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
    </div>
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
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { name, priceMnt, credits, active, position } = d;
    setSaving(true);
    const ok = await onSubmit({ name, priceMnt, credits, active, position });
    setSaving(false);
    if (ok && resetOnSuccess) setD(initial);
  }

  return (
    <form className={`${styles.item} ${styles.fieldGrid}`} onSubmit={submit}>
      <label className={styles.field}>
        {t('subscription.name')}
        <input className="input" required maxLength={100} value={d.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className={styles.field}>
        {t('subscription.priceMnt')}
        <input className="input" type="number" inputMode="numeric" min={1} required value={d.priceMnt} onChange={(e) => set('priceMnt', Number(e.target.value))} />
      </label>
      <label className={styles.field}>
        {t('subscription.credits')}
        <input className="input" type="number" inputMode="numeric" min={1} required value={d.credits} onChange={(e) => set('credits', Number(e.target.value))} />
      </label>
      <label className={styles.field}>
        {t('subscription.position')}
        <input className="input" type="number" inputMode="numeric" min={0} value={d.position} onChange={(e) => set('position', Number(e.target.value))} />
      </label>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
        {t('subscription.active')}
      </label>
      <small className={styles.muted}>
        {d.credits > 0 && t('subscription.perCredit', { price: formatMnt(Math.round(d.priceMnt / d.credits)) })}
      </small>
      <span className={styles.rowActions}>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        {onRemove && (
          <Button variant="ghost" onClick={onRemove}>
            {t('subscription.remove')}
          </Button>
        )}
      </span>
    </form>
  );
}
