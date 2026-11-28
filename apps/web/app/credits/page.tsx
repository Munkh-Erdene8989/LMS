'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  CreditBalanceView,
  CreditEntryView,
  CreditHistoryPage,
  CreditPackageView,
  TopupView,
} from '@lms/shared';
import { api, useApiFailure } from '@/lib/client-api';
import { formatCredits, formatDate, formatDelta, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { safeNext } from '@/lib/next-path';
import { Button } from '@/app/ui/button';
import { EmptyState } from '@/app/ui/empty-state';
import { Skeleton } from '@/app/ui/skeleton';
import { useToast } from '@/app/ui/toast';
import { QPayDialog } from './qpay-dialog';
import styles from './credits.module.css';

const POLL_MS = 4_000;
/** Хуудас нээлттэй үед төлбөрийн төлөвийг хэр удаан автоматаар шалгах */
const POLL_LIMIT_MS = 15 * 60_000;
/** Худалдан авалтаас ирсэн бол буцах хуудас (банкны апп-аас буцаж ирэхэд ч хадгалагдана) */
const RETURN_KEY = 'credits:returnTo';
const COUNT_UP_MS = 900;

function forgetReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // хувийн горим г.м — үл тооно
  }
}

/** Үүнээс цөөн хоног үлдсэн lot-ыг тодруулна (сануулгын эхний босготой ижил). */
const EXPIRY_WARN_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

function daysLeft(expiresAt: string): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
}

/** Тоо 0-ээс (эсвэл өмнөх утгаас) шинэ утга хүртэл өсөнө; reduced-motion-д шууд. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(origin + (target - origin) * eased);
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

export default function CreditsPage() {
  const fail = useApiFailure();
  const { toast } = useToast();
  const [balance, setBalance] = useState<CreditBalanceView | null>(null);
  const [packages, setPackages] = useState<CreditPackageView[]>([]);
  const [history, setHistory] = useState<CreditEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [topup, setTopup] = useState<TopupView | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const prevStatus = useRef<string | null>(null);
  const shown = useCountUp(balance?.balance ?? 0);

  const onError = useCallback(
    (err: unknown) => {
      const msg = fail(err);
      if (msg) setError(msg);
    },
    [fail],
  );

  const reload = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([
        api<CreditBalanceView>('/credits'),
        api<CreditHistoryPage>('/credits/history?limit=20'),
      ]);
      setBalance(b.data);
      setHistory(h.data.items);
      setCursor(h.data.nextCursor);
    } catch (err) {
      onError(err);
    }
  }, [onError]);

  useEffect(() => {
    void reload();
    api<CreditPackageView[]>('/credits/packages')
      .then((r) => setPackages(r.data))
      .catch(onError);
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));
    try {
      if (next) sessionStorage.setItem(RETURN_KEY, next);
      setReturnTo(next ?? safeNext(sessionStorage.getItem(RETURN_KEY)));
    } catch {
      setReturnTo(next);
    }
    // Банкны апп-аас буцаж ирэхэд нээлттэй төлбөрийг сэргээнэ.
    const id = new URLSearchParams(window.location.search).get('payment');
    if (id) {
      api<TopupView>(`/credits/topups/${id}`)
        .then((r) => setTopup(r.data))
        .catch(() => undefined);
    }
  }, [reload, onError]);

  // Хүлээгдэж буй төлбөрийн төлөвийг (callback ирсэн эсэх) DB-ээс тогтмол уншина.
  useEffect(() => {
    if (!topup || topup.status !== 'PENDING') return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) return clearInterval(timer);
      api<TopupView>(`/credits/topups/${topup.id}`)
        .then((r) => {
          if (r.data.status !== 'PENDING') {
            setTopup(r.data);
            void reload();
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [topup, reload]);

  // PENDING → PAID: toast + толгойн CreditPill шинэчлэх.
  useEffect(() => {
    const status = topup?.status ?? null;
    if (topup && prevStatus.current === 'PENDING' && status === 'PAID') {
      toast(t('creditsUi.paidToast', { count: formatNumber(topup.credits) }));
      window.dispatchEvent(new Event('credits:changed'));
    }
    prevStatus.current = status;
  }, [topup, toast]);

  function rememberPayment(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('payment', id);
    else url.searchParams.delete('payment');
    window.history.replaceState(null, '', url);
  }

  async function buy(pkg: CreditPackageView) {
    setError(null);
    setBusy(true);
    setBuyingId(pkg.id);
    try {
      const r = await api<TopupView>('/credits/topups', { method: 'POST', body: { packageId: pkg.id } });
      setTopup(r.data);
      rememberPayment(r.data.id);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setBuyingId(null);
    }
  }

  async function check() {
    if (!topup) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api<TopupView>(`/credits/topups/${topup.id}/check`, { method: 'POST' });
      setTopup(r.data);
      if (r.data.status !== 'PENDING') void reload();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setTopup(null);
    rememberPayment(null);
  }

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await api<CreditHistoryPage>(`/credits/history?limit=20&before=${cursor}`);
      setHistory((prev) => [...prev, ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      onError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!balance) {
    return (
      <div className="page-narrow">
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : (
          <div className={styles.stack} aria-busy="true" aria-label={t('me.loading')}>
            <Skeleton height={28} width="40%" />
            <Skeleton height={140} radius="var(--r-lg)" />
            <Skeleton height={160} radius="var(--r-lg)" />
          </div>
        )}
      </div>
    );
  }

  const popularId = packages.length >= 3 ? packages[1]!.id : null;
  const anySoon = balance.lots.some((l) => daysLeft(l.expiresAt) <= EXPIRY_WARN_DAYS);

  return (
    <div className={`page-narrow ${styles.stack}`}>
      <h1 className={styles.title}>{t('credits.title')}</h1>
      {returnTo && (
        <Link href={returnTo} onClick={forgetReturn} className={styles.back}>
          {t('purchase.backToPurchase')}
        </Link>
      )}

      <section className={styles.hero} aria-label={t('credits.balance')}>
        <span className={styles.heroLabel}>{t('creditsUi.balanceLabel')}</span>
        <p className={styles.heroValue}>
          <span aria-hidden="true">{formatNumber(shown)}</span>
          <span className={styles.srOnly}>{formatCredits(balance.balance)}</span>
          <span className={styles.heroUnit} aria-hidden="true">
            {t('credits.nav').toLowerCase()}
          </span>
        </p>
        <span className={styles.heroCoin} aria-hidden="true" />
      </section>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <section className={styles.section} aria-labelledby="credits-buy">
        <h2 id="credits-buy" className={styles.h2}>
          {t('credits.buy')}
        </h2>
        <p className={styles.muted}>{t('creditsUi.buyHint')}</p>
        {packages.length === 0 ? (
          <EmptyState title={t('creditsUi.noPackagesTitle')} description={t('credits.noPackages')} />
        ) : (
          <ul className={styles.packages}>
            {packages.map((p) => (
              <li key={p.id}>
                <article className={`${styles.package} ${p.id === popularId ? styles.popular : ''}`}>
                  {p.id === popularId && <span className={styles.badge}>{t('creditsUi.popular')}</span>}
                  <span className={styles.packageCredits}>
                    {formatCredits(p.credits)}{' '}
                    {p.isTest && <span className={styles.test}>{t('credits.testBadge')}</span>}
                  </span>
                  <span className={styles.packagePrice}>{t('credits.packagePrice', { price: formatMnt(p.priceMnt) })}</span>
                  <span className={styles.packageName}>{p.name}</span>
                  {p.credits > 0 && (
                    <span className={styles.perCredit}>
                      {t('creditsUi.perCredit', { price: formatMnt(Math.round(p.priceMnt / p.credits)) })}
                    </span>
                  )}
                  <Button
                    variant={p.id === popularId ? 'primary' : 'secondary'}
                    disabled={busy && buyingId !== p.id}
                    loading={buyingId === p.id}
                    loadingLabel={t('creditsUi.creating')}
                    onClick={() => void buy(p)}
                  >
                    {t('creditsUi.choose')}
                  </Button>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="credits-lots">
        <h2 id="credits-lots" className={styles.h2}>
          {t('credits.lots')}
        </h2>
        {balance.lots.length === 0 ? (
          <p className={styles.muted}>{t('credits.noLots')}</p>
        ) : (
          <>
            <p className={styles.muted}>{t('creditsUi.lotsHint')}</p>
            {anySoon && <p className={styles.warn}>{t('credits.expiresSoonNote')}</p>}
            <ul className={styles.lots}>
              {balance.lots.map((l) => {
                const days = daysLeft(l.expiresAt);
                const soon = days <= EXPIRY_WARN_DAYS;
                return (
                  <li key={l.id} className={`${styles.lot} ${soon ? styles.lotSoon : ''}`}>
                    <span>
                      {t('creditsUi.lotRemaining', {
                        remaining: formatNumber(l.remaining),
                        initial: formatNumber(l.initial),
                      })}
                      <br />
                      <small className={styles.muted}>{t(`credits.type${l.source}` as MessageKey)}</small>
                    </span>
                    <span className={styles.lotMeta}>
                      {soon && <strong className={styles.warn}>{t('credits.expiresInDays', { days })}</strong>}
                      <time dateTime={l.expiresAt}>{t('credits.expires', { date: formatDate(l.expiresAt) })}</time>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="credits-history">
        <h2 id="credits-history" className={styles.h2}>
          {t('credits.history')}
        </h2>
        {history.length === 0 ? (
          <EmptyState title={t('creditsUi.noHistoryTitle')} description={t('credits.noHistory')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>{t('creditsUi.historyCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('creditsUi.colDate')}</th>
                  <th scope="col">{t('creditsUi.colType')}</th>
                  <th scope="col" className={styles.num}>
                    {t('creditsUi.colAmount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time>
                    </td>
                    <td>
                      {t(`credits.type${e.type}` as MessageKey)}{' '}
                      {e.isTest && <span className={styles.test}>{t('credits.testBadge')}</span>}
                      {e.reason && <span className={styles.reason}>{e.reason}</span>}
                    </td>
                    <td className={`${styles.num} ${e.amount > 0 ? styles.plus : ''}`}>{formatDelta(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <Button
            variant="ghost"
            className={styles.more}
            loading={loadingMore}
            loadingLabel={t('creditsUi.loadingMore')}
            onClick={() => void more()}
          >
            {t('credits.loadMore')}
          </Button>
        )}
      </section>

      {topup && (
        <QPayDialog
          open
          status={topup.status}
          amountMnt={topup.amountMnt}
          qrImage={topup.qrImage}
          deeplinks={topup.deeplinks}
          busy={busy}
          labels={{
            title: t('credits.payTitle', { amount: '{amount}' }),
            scan: t('credits.scanQr'),
            qrAlt: t('credits.qrAlt'),
            openBank: t('credits.openBank'),
            pending: t('credits.pending'),
            result:
              topup.status === 'PAID'
                ? t('credits.paid', { count: formatNumber(topup.credits) })
                : t(topup.status === 'AMOUNT_MISMATCH' ? 'credits.mismatch' : 'credits.failed'),
            check: t('credits.check'),
            checking: t('credits.checking'),
            close: t('credits.cancel'),
          }}
          onCheck={() => void check()}
          onClose={close}
        />
      )}
    </div>
  );
}
