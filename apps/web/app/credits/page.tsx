'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CreditBalanceView,
  CreditEntryView,
  CreditHistoryPage,
  CreditPackageView,
  TopupView,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const POLL_MS = 4_000;
/** Хуудас нээлттэй үед төлбөрийн төлөвийг хэр удаан автоматаар шалгах */
const POLL_LIMIT_MS = 15 * 60_000;
/** Үүнээс цөөн хоног үлдсэн lot-ыг тодруулна (сануулгын эхний босготой ижил). */
const EXPIRY_WARN_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

function daysLeft(expiresAt: string): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
}

export default function CreditsPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<CreditBalanceView | null>(null);
  const [packages, setPackages] = useState<CreditPackageView[]>([]);
  const [history, setHistory] = useState<CreditEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [topup, setTopup] = useState<TopupView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
      else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    },
    [router],
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

  function rememberPayment(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('payment', id);
    else url.searchParams.delete('payment');
    window.history.replaceState(null, '', url);
  }

  async function buy(pkg: CreditPackageView) {
    setError(null);
    setBusy(true);
    try {
      const r = await api<TopupView>('/credits/topups', { method: 'POST', body: { packageId: pkg.id } });
      setTopup(r.data);
      rememberPayment(r.data.id);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
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
    try {
      const r = await api<CreditHistoryPage>(`/credits/history?limit=20&before=${cursor}`);
      setHistory((prev) => [...prev, ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      onError(err);
    }
  }

  if (!balance) {
    return (
      <main className="page">
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('credits.title')}</h1>

      <section className="card credit-balance">
        <span style={{ color: 'var(--muted)' }}>{t('credits.balance')}</span>
        <strong>{t('credits.creditsCount', { count: formatNumber(balance.balance) })}</strong>
      </section>

      {error && <p style={{ color: 'var(--err)', margin: 0 }}>{error}</p>}

      {topup ? (
        <TopupPanel topup={topup} busy={busy} onCheck={check} onClose={close} />
      ) : (
        <section style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{t('credits.buy')}</h2>
          {packages.length === 0 && <p style={{ margin: 0 }}>{t('credits.noPackages')}</p>}
          <div className="grid-2">
            {packages.map((p) => (
              <button key={p.id} className="card package-card" disabled={busy} onClick={() => buy(p)}>
                <strong>
                  {t('credits.creditsCount', { count: formatNumber(p.credits) })}{' '}
                  {p.isTest && <span className="badge-status">{t('credits.testBadge')}</span>}
                </strong>
                <span>{t('credits.packagePrice', { price: formatNumber(p.priceMnt) })}</span>
                <small style={{ color: 'var(--muted)' }}>{p.name}</small>
              </button>
            ))}
          </div>
          {busy && <p style={{ margin: 0 }}>{t('credits.creating')}</p>}
        </section>
      )}

      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{t('credits.lots')}</h2>
        {balance.lots.length === 0 && <p style={{ margin: 0 }}>{t('credits.noLots')}</p>}
        {balance.lots.some((l) => daysLeft(l.expiresAt) <= EXPIRY_WARN_DAYS) && (
          <p style={{ margin: 0, color: 'var(--err)' }}>{t('credits.expiresSoonNote')}</p>
        )}
        <ul className="lesson-list">
          {balance.lots.map((l) => {
            const days = daysLeft(l.expiresAt);
            const soon = days <= EXPIRY_WARN_DAYS;
            return (
              <li
                key={l.id}
                className="lesson-row card"
                style={{ padding: '8px 12px', ...(soon ? { borderColor: 'var(--err)' } : {}) }}
              >
                <span>
                  {t('credits.lotLine', { remaining: l.remaining, initial: l.initial })}{' '}
                  <small>{t(`credits.type${l.source}` as MessageKey)}</small>
                </span>
                <span style={{ display: 'grid', justifyItems: 'end' }}>
                  {soon && (
                    <strong style={{ color: 'var(--err)', fontSize: 14 }}>
                      {t('credits.expiresInDays', { days })}
                    </strong>
                  )}
                  <small>{t('credits.expires', { date: formatDate(l.expiresAt) })}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{t('credits.history')}</h2>
        {history.length === 0 && <p style={{ margin: 0 }}>{t('credits.noHistory')}</p>}
        <ul className="lesson-list">
          {history.map((e) => (
            <li key={e.id} className="lesson-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <span style={{ display: 'grid' }}>
                <span>
                  {t(`credits.type${e.type}` as MessageKey)}{' '}
                  {e.isTest && <span className="badge-status">{t('credits.testBadge')}</span>}
                </span>
                {e.reason && <small>{e.reason}</small>}
                <small>{formatDate(e.createdAt)}</small>
              </span>
              <strong style={{ color: e.amount > 0 ? 'var(--ok)' : 'var(--fg)' }}>
                {e.amount > 0 ? '+' : '−'}
                {formatNumber(Math.abs(e.amount))}
              </strong>
            </li>
          ))}
        </ul>
        {cursor && (
          <button className="btn btn-ghost" onClick={more}>
            {t('credits.loadMore')}
          </button>
        )}
      </section>
    </main>
  );
}

function TopupPanel({
  topup,
  busy,
  onCheck,
  onClose,
}: {
  topup: TopupView;
  busy: boolean;
  onCheck: () => void;
  onClose: () => void;
}) {
  if (topup.status === 'PAID') {
    return (
      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0, color: 'var(--ok)', fontWeight: 700 }}>
          {t('credits.paid', { count: formatNumber(topup.credits) })}
        </p>
        <button className="btn btn-ghost" onClick={onClose}>
          {t('credits.cancel')}
        </button>
      </section>
    );
  }
  if (topup.status !== 'PENDING') {
    return (
      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0, color: 'var(--err)' }}>
          {t(topup.status === 'AMOUNT_MISMATCH' ? 'credits.mismatch' : 'credits.failed')}
        </p>
        <button className="btn btn-ghost" onClick={onClose}>
          {t('credits.cancel')}
        </button>
      </section>
    );
  }
  return (
    <section className="card qpay-panel">
      <h2 style={{ margin: 0 }}>{t('credits.payTitle', { amount: formatNumber(topup.amountMnt) })}</h2>
      <p style={{ margin: 0 }}>{t('credits.scanQr')}</p>
      {topup.qrImage && (
        <img className="qpay-qr" src={`data:image/png;base64,${topup.qrImage}`} alt={t('credits.qrAlt')} />
      )}
      {topup.deeplinks.length > 0 && (
        <div className="bank-links" aria-label={t('credits.openBank')}>
          {topup.deeplinks.map((d) => (
            <a key={d.link} className="bank-link" href={d.link}>
              {d.logo && (
                <img src={d.logo} alt="" width={32} height={32} />
              )}
              <span>{d.description || d.name}</span>
            </a>
          ))}
        </div>
      )}
      <p style={{ margin: 0, color: 'var(--muted)' }}>{t('credits.pending')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy} onClick={onCheck}>
          {busy ? t('credits.checking') : t('credits.check')}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          {t('credits.cancel')}
        </button>
      </div>
    </section>
  );
}
