'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PAYMENT_ISSUE_KINDS } from '@lms/shared';
import type { AdminPaymentRow, PaymentIssueKind, PaymentIssueView, PaymentIssuesView, ReconcileCanceledResult } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

/** Асуудалтай төлбөр: дахин шалгах, олгох/хаах (мөнгөний үйлдэл, баталгаажуулалттай), цуцалсныг тулгах. */
export default function AdminPaymentIssuesPage() {
  const [data, setData] = useState<PaymentIssuesView | null>(null);
  const [kind, setKind] = useState<PaymentIssueKind | 'ALL'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await api<PaymentIssuesView>('/admin/payments/issues')).data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile() {
    if (!window.confirm(t('adminOps.reconcileConfirm'))) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api<ReconcileCanceledResult>('/admin/payments/reconcile-canceled', { method: 'POST' });
      setInfo(t('adminOps.reconcileDone', { checked: r.data.checked, found: r.data.found, failed: r.data.failed }));
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items.filter((i) => kind === 'ALL' || i.kind === kind) ?? [];

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('adminOps.paymentsTitle')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('adminOps.paymentsHint')} {data && t('adminOps.staleHint', { minutes: data.staleMinutes })}
      </p>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button role="tab" aria-selected={kind === 'ALL'} className={kind === 'ALL' ? 'btn' : 'btn btn-ghost'} onClick={() => setKind('ALL')}>
          {t('adminOps.kindAll')}{data && ` (${data.items.length})`}
        </button>
        {PAYMENT_ISSUE_KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'btn' : 'btn btn-ghost'} onClick={() => setKind(k)}>
            {t(`adminOps.kind${k}` as MessageKey)}{data && ` (${data.counts[k] ?? 0})`}
          </button>
        ))}
      </div>
      <div>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reconcile()}>
          {t('adminOps.reconcile')}
        </button>
      </div>
      {info && <p style={{ margin: 0 }}>{info}</p>}
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {!data && !error && <p>{t('me.loading')}</p>}
      {data && items.length === 0 && <p>{t('adminOps.noIssues')}</p>}
      {items.map((p) => <IssueCard key={p.id} issue={p} onDone={load} />)}
    </main>
  );
}

function IssueCard({ issue: p, onDone }: { issue: PaymentIssueView; onDone: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const who = [p.user.name ?? t('admin.someone'), p.user.phone, p.user.email].filter(Boolean).join(' · ');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const recheck = () =>
    run(async () => {
      const r = await api<AdminPaymentRow>(`/admin/payments/${p.id}/recheck`, { method: 'POST' });
      setInfo(t('adminOps.recheckDone', { status: t(`adminOps.payStatus${r.data.status}` as MessageKey) }));
      await onDone();
    });

  const resolve = (action: 'GRANT' | 'CLOSE') => {
    const text = action === 'GRANT' ? t('adminOps.grantConfirm', { credits: formatNumber(p.credits), user: who }) : t('adminOps.closeConfirm');
    if (!window.confirm(text)) return Promise.resolve();
    return run(async () => {
      await api(`/admin/payments/${p.id}/resolve`, { method: 'POST', body: { action, note: note.trim() } });
      await onDone();
    });
  };

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>
          <span className="pill">{t(`adminOps.kind${p.kind}` as MessageKey)}</span> {formatMnt(p.amountMnt)}
          {p.isTest && <span className="pill" style={{ marginLeft: 6 }}>{t('adminOps.testPill')}</span>}
        </strong>
        <span className="muted" style={{ fontSize: 14 }}>{formatDate(p.createdAt)}</span>
      </div>
      <p style={{ margin: 0 }}>
        <Link href={`/admin/users/${p.user.id}`}>{who}</Link>
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {t(`adminOps.purpose${p.purpose}` as MessageKey)} · {t(`adminOps.method${p.method}` as MessageKey)} · {t(`adminOps.payStatus${p.status}` as MessageKey)} ·{' '}
        {t('adminOps.colCredits')}: {formatNumber(p.credits)}
        {p.paidAmountMnt !== null && ` · ${t('adminOps.paidAmount', { amount: formatNumber(p.paidAmountMnt) })}`}
        {p.providerInvoiceId && <> · <code>{p.providerInvoiceId}</code></>}
        {p.providerPaymentId && <> · <code>{p.providerPaymentId}</code></>}
        {p.failureReason && ` · ${p.failureReason}`}
      </p>
      {p.resolution && (
        <p style={{ margin: 0 }}>
          {t('adminOps.resolved', { resolution: t(`adminOps.res${p.resolution}` as MessageKey) })}
          {p.resolutionNote && ` · ${p.resolutionNote}`}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void recheck()}>
          {t('adminOps.recheck')}
        </button>
      </div>
      {!p.resolution && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 240px' }} placeholder={t('adminOps.resolveNote')} aria-label={t('adminOps.resolveNote')} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn" disabled={busy || note.trim().length < 3} onClick={() => void resolve('GRANT')}>
            {t('adminOps.grant')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy || note.trim().length < 3} onClick={() => void resolve('CLOSE')}>
            {t('adminOps.close')}
          </button>
        </div>
      )}
      {info && <p style={{ margin: 0 }}>{info}</p>}
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
    </section>
  );
}
