'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeacherEarningEntryView, TeacherEarningsView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { PayoutSection } from './payouts';

const mnt = (n: number) => t('earnings.mnt', { amount: formatNumber(n) });

/** Багшийн орлого: payout хийх боломжтой үлдэгдэл, борлуулалт бүрийн тооцоо (худалдах үеийн үнэ, шимтгэл). */
export default function TeacherEarningsPage() {
  const router = useRouter();
  const [view, setView] = useState<TeacherEarningsView | null>(null);
  const [items, setItems] = useState<TeacherEarningEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/teacher/earnings');
      else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    },
    [router],
  );

  useEffect(() => {
    api<TeacherEarningsView>('/teacher/earnings?limit=30')
      .then((r) => {
        setView(r.data);
        setItems(r.data.items);
        setCursor(r.data.nextCursor);
      })
      .catch(onError);
  }, [onError]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<TeacherEarningsView>(`/teacher/earnings?limit=30&before=${cursor}`);
      setItems((prev) => [...prev, ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      onError(err);
    }
  }

  if (!view) {
    return (
      <main className="page">
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  return (
    <main className="page wide" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('earnings.title')}</h1>
      <div className="grid-2">
        <section className="card credit-balance">
          <span className="muted">{t('earnings.balance')}</span>
          <strong>{mnt(view.balanceMnt)}</strong>
        </section>
        <section className="card credit-balance">
          <span className="muted">{t('earnings.total')}</span>
          <strong>{mnt(view.totalEarnedMnt)}</strong>
        </section>
      </div>
      {view.testBalanceMnt !== 0 && <p className="muted" style={{ margin: 0 }}>{t('earnings.testBalance', { amount: formatNumber(view.testBalanceMnt) })}</p>}
      <p className="muted" style={{ margin: 0 }}>
        {t('earnings.formula')}
      </p>

      <PayoutSection />

      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{t('earnings.history')}</h2>
        {items.length === 0 ? (
          <p style={{ margin: 0 }}>{t('earnings.empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('earnings.date')}</th>
                  <th>{t('earnings.item')}</th>
                  <th>{t('earnings.calc')}</th>
                  <th style={{ textAlign: 'right' }}>{t('earnings.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.createdAt)}</td>
                    <td>
                      {t(`earnings.type${e.type}` as MessageKey)}
                      {e.sale && (
                        <>
                          {': '}
                          {e.sale.lessonTitle ? `${e.sale.courseTitle} — ${e.sale.lessonTitle}` : t('earnings.fullCourse', { title: e.sale.courseTitle })}
                        </>
                      )}
                      {e.reason && <small className="muted"> · {e.reason}</small>}
                      {e.isTest && <span className="pill"> {t('earnings.test')}</span>}
                    </td>
                    <td>
                      {e.credits !== null && e.creditPriceMnt !== null && e.commissionPercent !== null && (
                        <small>
                          {t('earnings.calcValue', {
                            credits: formatNumber(e.credits),
                            price: formatNumber(e.creditPriceMnt),
                            commission: e.commissionPercent,
                          })}
                          {e.attribution && ` · ${t(`earnings.attribution${e.attribution}` as MessageKey)}`}
                        </small>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', color: e.amountMnt < 0 ? 'var(--err)' : undefined }}>
                      {e.amountMnt > 0 ? '+' : ''}
                      {mnt(e.amountMnt)}
                    </td>
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
    </main>
  );
}
