'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { PayoutView, TeacherPayoutsView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { EmptyState } from '../../ui/empty-state';
import { useToast } from '../../ui/toast';
import s from '../teacher.module.css';

/** Payout: боломжтой / түгжигдсэн үлдэгдэл, хүсэлт гаргах, хүсэлтийн түүх. */
export function PayoutSection() {
  const confirm = useConfirm();
  const { toast } = useToast();
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
    if (!view) return;
    const ok = await confirm({
      title: t('teacherUi.payoutConfirmTitle'),
      body: t('payout.confirm', { amount: formatMnt(view.availableMnt) }),
      confirmLabel: t('teacherUi.payoutConfirmLabel'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api('/teacher/payouts', { method: 'POST' });
      await load();
      toast(t('teacherUi.payoutRequested'));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  if (!view)
    return error ? (
      <p role="alert" className={s.error}>
        {error}
      </p>
    ) : null;

  return (
    <section className={`card ${s.card}`}>
      <h2 className={s.sectionTitle}>{t('payout.title')}</h2>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>{t('payout.available')}</span>
          <strong className={s.statValue}>{formatMnt(view.availableMnt)}</strong>
        </div>
        {view.lockedMnt > 0 && (
          <div className={s.stat}>
            <span className={s.statLabel}>{t('payout.locked')}</span>
            <strong className={s.statValue}>{formatMnt(view.lockedMnt)}</strong>
          </div>
        )}
      </div>
      <p className={s.hint}>{t('payout.minimum', { amount: formatMnt(view.minimumMnt) })}</p>

      {view.blockReason ? (
        <p className={s.lead}>
          {t(`payout.block${view.blockReason}` as MessageKey, { amount: formatMnt(view.minimumMnt) })}
          {view.blockReason === 'NO_BANK_ACCOUNT' && (
            <>
              {' '}
              <Link href="/teacher/apply">{t('payout.addBank')}</Link>
            </>
          )}
        </p>
      ) : (
        <Button className={s.startSelf} loading={busy} onClick={() => void request()}>
          {t('payout.request', { amount: formatMnt(view.availableMnt) })}
        </Button>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      <h3 className={s.sectionTitle}>{t('payout.history')}</h3>
      {items.length === 0 ? (
        <EmptyState title={t('payout.empty')} />
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('payout.requestedAt')}</th>
                <th scope="col">{t('payout.status')}</th>
                <th scope="col">{t('payout.account')}</th>
                <th scope="col" className="num">
                  {t('earnings.amount')}
                </th>
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
                  <td className="num">{formatMnt(p.amountMnt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <Button variant="secondary" className={s.startSelf} onClick={() => void more()}>
          {t('credits.loadMore')}
        </Button>
      )}
    </section>
  );
}
