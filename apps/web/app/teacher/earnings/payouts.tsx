'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PayoutView, TeacherPayoutsView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const mnt = (n: number) => t('earnings.mnt', { amount: formatNumber(n) });

/** Payout: боломжтой / түгжигдсэн үлдэгдэл, хүсэлт гаргах, хүсэлтийн түүх. */
export function PayoutSection() {
  const [view, setView] = useState<TeacherPayoutsView | null>(null);
  const [items, setItems] = useState<PayoutView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<TeacherPayoutsView>('/teacher/payouts?limit=20');
      setView(r.data);
      setItems(r.data.items);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<TeacherPayoutsView>(`/teacher/payouts?limit=20&before=${cursor}`);
      setItems((prev) => [...prev, ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    }
  }

  async function request() {
    if (!view || !window.confirm(t('payout.confirm', { amount: formatNumber(view.availableMnt) }))) return;
    setBusy(true);
    setError(null);
    try {
      await api('/teacher/payouts', { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p> : null;

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>{t('payout.title')}</h2>
      <div className="grid-2">
        <div className="credit-balance">
          <span className="muted">{t('payout.available')}</span>
          <strong>{mnt(view.availableMnt)}</strong>
        </div>
        {view.lockedMnt > 0 && (
          <div className="credit-balance">
            <span className="muted">{t('payout.locked')}</span>
            <strong>{mnt(view.lockedMnt)}</strong>
          </div>
        )}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {t('payout.minimum', { amount: formatNumber(view.minimumMnt) })}
      </p>

      {view.blockReason ? (
        <p style={{ margin: 0 }}>
          {t(`payout.block${view.blockReason}` as MessageKey, { amount: formatNumber(view.minimumMnt) })}
          {view.blockReason === 'NO_BANK_ACCOUNT' && (
            <>
              {' '}
              <a href="/teacher/apply">{t('payout.addBank')}</a>
            </>
          )}
        </p>
      ) : (
        <div>
          <button type="button" className="btn" disabled={busy} onClick={() => void request()}>
            {t('payout.request', { amount: formatNumber(view.availableMnt) })}
          </button>
        </div>
      )}
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}

      <h3 style={{ margin: 0 }}>{t('payout.history')}</h3>
      {items.length === 0 ? (
        <p style={{ margin: 0 }}>{t('payout.empty')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('payout.requestedAt')}</th>
                <th>{t('payout.status')}</th>
                <th>{t('payout.account')}</th>
                <th style={{ textAlign: 'right' }}>{t('earnings.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.requestedAt)}</td>
                  <td>
                    <span className="pill">{t(`payout.status${p.status}` as MessageKey)}</span>
                    {p.processedAt && <small className="muted"> · {formatDate(p.processedAt)}</small>}
                    {p.rejectReason && <small className="muted"> · {p.rejectReason}</small>}
                  </td>
                  <td>
                    <small>
                      {t(`banks.${p.bank}` as MessageKey)} · {p.accountNumber}
                    </small>
                  </td>
                  <td style={{ textAlign: 'right' }}>{mnt(p.amountMnt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button type="button" className="btn btn-ghost" onClick={() => void more()}>
          {t('credits.loadMore')}
        </button>
      )}
    </section>
  );
}
