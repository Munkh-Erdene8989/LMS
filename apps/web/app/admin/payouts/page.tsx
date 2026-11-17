'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminPayoutPage, AdminPayoutView, PayoutHoldView, PayoutStatus } from '@lms/shared';
import { api, apiDownload, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const STATUSES: PayoutStatus[] = ['REQUESTED', 'PAID', 'REJECTED'];
const mnt = (n: number) => t('earnings.mnt', { amount: formatNumber(n) });
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

/** Payout дараалал: CSV export → банкаар гараар шилжүүлэх → "төлсөн"; татгалзах; багшийн hold. */
export default function AdminPayoutsPage() {
  const [status, setStatus] = useState<PayoutStatus>('REQUESTED');
  const [items, setItems] = useState<AdminPayoutView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [holds, setHolds] = useState<PayoutHoldView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [page, h] = await Promise.all([
        api<AdminPayoutPage>(`/admin/payouts?status=${status}`),
        api<PayoutHoldView[]>('/admin/payouts/holds'),
      ]);
      setItems(page.data.items);
      setCursor(page.data.nextCursor);
      setHolds(h.data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [status]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<AdminPayoutPage>(`/admin/payouts?status=${status}&before=${cursor}`);
      setItems((prev) => [...(prev ?? []), ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function exportCsv() {
    setError(null);
    try {
      await apiDownload('/admin/payouts/export.csv', `payouts-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function release(teacherId: string) {
    try {
      await api(`/admin/payouts/holds/${teacherId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const total = items?.reduce((s, p) => s + p.amountMnt, 0) ?? 0;

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('payout.adminTitle')}</h1>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={s === status} className={s === status ? 'btn' : 'btn btn-ghost'} onClick={() => setStatus(s)}>
            {t(`payout.tab${s}` as MessageKey)}
          </button>
        ))}
      </div>
      {status === 'REQUESTED' && items && items.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => void exportCsv()}>
            {t('payout.exportCsv')}
          </button>
          <span className="muted">{t('payout.queueTotal', { count: items.length, amount: formatNumber(total) })}</span>
        </div>
      )}
      {status === 'REQUESTED' && <p className="muted" style={{ margin: 0 }}>{t('payout.adminHint')}</p>}
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {!items && !error && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('payout.adminEmpty')}</p>}
      {items?.map((p) => <PayoutCard key={p.id} payout={p} onDone={load} />)}
      {cursor && (
        <button type="button" className="btn btn-ghost" onClick={() => void more()}>
          {t('admin.loadMore')}
        </button>
      )}

      <h2 style={{ margin: '16px 0 0' }}>{t('payout.holdsTitle')}</h2>
      {holds.length === 0 ? (
        <p style={{ margin: 0 }}>{t('payout.holdsEmpty')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('payout.teacher')}</th>
                <th>{t('teacher.reason')}</th>
                <th>{t('admin.when')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {holds.map((h) => (
                <tr key={h.teacher.id}>
                  <td>{contactLine(h.teacher)}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{h.reason}</td>
                  <td>
                    {formatDate(h.createdAt)}
                    {h.createdBy && <small className="muted"> · {h.createdBy.name ?? t('admin.someone')}</small>}
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void release(h.teacher.id)}>
                      {t('payout.release')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function contactLine(u: AdminPayoutView['teacher']): string {
  return [u.name ?? t('admin.someone'), u.phone, u.email].filter(Boolean).join(' · ');
}

function PayoutCard({ payout: p, onDone }: { payout: AdminPayoutView; onDone: () => Promise<void> }) {
  const [transferRef, setTransferRef] = useState('');
  const [reason, setReason] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, method: string, body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await api(path, { method, body });
      await onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{mnt(p.amountMnt)}</strong>
        <span className="muted" style={{ fontSize: 14 }}>
          {t('payout.requestedOn', { date: formatDate(p.requestedAt) })}
        </span>
      </div>
      <p style={{ margin: 0 }}>
        <strong>{t('payout.teacher')}:</strong> {contactLine(p.teacher)}
        {p.onHold && <span className="pill" style={{ marginLeft: 8, color: 'var(--err)' }}>{t('payout.onHold')}</span>}
      </p>
      <p style={{ margin: 0 }}>
        <strong>{t('teacher.bank')}:</strong> {t(`banks.${p.bank}` as MessageKey)} · <code>{p.accountNumber}</code> · {p.holderName}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {t('payout.teacherBalance', { amount: formatNumber(p.teacherBalanceMnt) })}
      </p>
      {p.status !== 'REQUESTED' && (
        <p style={{ margin: 0 }}>
          <span className="pill">{t(`payout.status${p.status}` as MessageKey)}</span>{' '}
          {p.processedAt && formatDate(p.processedAt)}
          {p.processedBy && ` · ${p.processedBy.name ?? t('admin.someone')}`}
          {p.transferRef && ` · ${p.transferRef}`}
          {p.rejectReason && ` · ${p.rejectReason}`}
        </p>
      )}

      {p.status === 'REQUESTED' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: '1 1 200px' }}
              placeholder={t('payout.transferRef')}
              aria-label={t('payout.transferRef')}
              value={transferRef}
              onChange={(e) => setTransferRef(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={busy || p.onHold}
              onClick={() =>
                void act(
                  `/admin/payouts/${p.id}/paid`,
                  'POST',
                  transferRef.trim() ? { transferRef: transferRef.trim() } : {},
                  t('payout.paidConfirm', { amount: formatNumber(p.amountMnt) }),
                )
              }
            >
              {t('payout.markPaid')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: '1 1 200px' }}
              placeholder={t('payout.rejectReason')}
              aria-label={t('payout.rejectReason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !reason.trim()}
              onClick={() => void act(`/admin/payouts/${p.id}/reject`, 'POST', { reason: reason.trim() })}
            >
              {t('payout.reject')}
            </button>
          </div>
        </div>
      )}

      {!p.onHold && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 200px' }}
            placeholder={t('payout.holdReason')}
            aria-label={t('payout.holdReason')}
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !holdReason.trim()}
            onClick={() => void act(`/admin/payouts/holds/${p.teacher.id}`, 'PUT', { reason: holdReason.trim() })}
          >
            {t('payout.hold')}
          </button>
        </div>
      )}
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
    </section>
  );
}
