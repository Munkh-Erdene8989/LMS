'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeacherEarningEntryView, TeacherEarningsView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import s from '../teacher.module.css';
import { PayoutSection } from './payouts';

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
      <div className={s.page}>
        <h1 className={s.title}>{t('earnings.title')}</h1>
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : (
          <div className={s.stats} aria-busy="true" aria-label={t('ui.loading')}>
            <Skeleton height={88} radius={22} />
            <Skeleton height={88} radius={22} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={s.page}>
      <h1 className={s.title}>{t('earnings.title')}</h1>
      <div className={s.stats}>
        <section className={`card ${s.stat}`}>
          <span className={s.statLabel}>{t('earnings.balance')}</span>
          <strong className={s.statValue}>{formatMnt(view.balanceMnt)}</strong>
        </section>
        <section className={`card ${s.stat}`}>
          <span className={s.statLabel}>{t('earnings.total')}</span>
          <strong className={s.statValue}>{formatMnt(view.totalEarnedMnt)}</strong>
        </section>
      </div>
      {view.testBalanceMnt !== 0 && <p className={s.hint}>{t('earnings.testBalance', { amount: formatMnt(view.testBalanceMnt) })}</p>}
      <p className={s.hint}>{t('earnings.formula')}</p>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      <PayoutSection />

      <section className={`card ${s.card}`}>
        <h2 className={s.sectionTitle}>{t('earnings.history')}</h2>
        {items.length === 0 ? (
          <EmptyState title={t('earnings.empty')} />
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">{t('earnings.date')}</th>
                  <th scope="col">{t('earnings.item')}</th>
                  <th scope="col">{t('earnings.calc')}</th>
                  <th scope="col" className={s.num}>
                    {t('earnings.amount')}
                  </th>
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
                            price: formatMnt(e.creditPriceMnt),
                            commission: e.commissionPercent,
                          })}
                          {e.attribution && ` · ${t(`earnings.attribution${e.attribution}` as MessageKey)}`}
                        </small>
                      )}
                    </td>
                    <td className={e.amountMnt < 0 ? `${s.num} ${s.neg}` : s.num}>
                      {e.amountMnt > 0 ? '+' : ''}
                      {formatMnt(e.amountMnt)}
                    </td>
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
    </div>
  );
}
