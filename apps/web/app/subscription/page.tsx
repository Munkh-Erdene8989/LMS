'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CardRegistrationStart,
  SubscriptionActionResult,
  SubscriptionOverview,
  SubscriptionPaymentView,
  SubscriptionPlanView,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const POLL_MS = 4_000;
/** Хуудас нээлттэй үед төлбөрийн төлөвийг хэр удаан автоматаар шалгах */
const POLL_LIMIT_MS = 15 * 60_000;

export default function SubscriptionPage() {
  const router = useRouter();
  const [ov, setOv] = useState<SubscriptionOverview | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanView[]>([]);
  const [payment, setPayment] = useState<SubscriptionPaymentView | null>(null);
  const [choosing, setChoosing] = useState(false);
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
      const r = await api<SubscriptionOverview>('/subscription');
      setOv(r.data);
      return r.data;
    } catch (err) {
      onError(err);
      return null;
    }
  }, [onError]);

  useEffect(() => {
    void reload().then((o) => {
      if (o?.pendingPayment) setPayment(o.pendingPayment);
    });
    api<SubscriptionPlanView[]>('/subscription/plans')
      .then((r) => setPlans(r.data))
      .catch(onError);
    // QPay-ийн карт бүртгэлийн хуудаснаас буцаж ирэхэд
    const params = new URLSearchParams(window.location.search);
    if (params.get('card')) {
      api<SubscriptionOverview>('/subscription/card/check', { method: 'POST' })
        .then((r) => setOv(r.data))
        .catch(onError)
        .finally(() => window.history.replaceState(null, '', '/subscription'));
    }
  }, [reload, onError]);

  // Хүлээгдэж буй нэхэмжлэхийн төлөвийг (callback ирсэн эсэх) тогтмол уншина.
  useEffect(() => {
    if (!payment || payment.status !== 'PENDING') return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) return clearInterval(timer);
      api<SubscriptionPaymentView>(`/subscription/payments/${payment.id}`)
        .then((r) => {
          if (r.data.status !== 'PENDING') {
            setPayment(r.data);
            void reload();
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [payment, reload]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      onError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function applyResult(r: SubscriptionActionResult | null) {
    if (!r) return;
    setOv(r.overview);
    setPayment(r.payment);
    setChoosing(false);
  }

  const start = (plan: SubscriptionPlanView) =>
    run(() => api<SubscriptionActionResult>('/subscription', { method: 'POST', body: { planId: plan.id } })).then(
      (r) => applyResult(r?.data ?? null),
    );
  const reactivate = () =>
    run(() => api<SubscriptionActionResult>('/subscription/reactivate', { method: 'POST' })).then((r) =>
      applyResult(r?.data ?? null),
    );
  const pay = () =>
    run(() => api<SubscriptionActionResult>('/subscription/pay', { method: 'POST' })).then((r) =>
      applyResult(r?.data ?? null),
    );
  const cancel = () => {
    if (!window.confirm(t('subscription.cancelConfirm'))) return;
    void run(() => api<SubscriptionOverview>('/subscription/cancel', { method: 'POST' })).then((r) => {
      if (r) {
        setOv(r.data);
        setPayment(null);
      }
    });
  };
  const check = () => {
    if (!payment) return;
    void run(() => api<SubscriptionPaymentView>(`/subscription/payments/${payment.id}/check`, { method: 'POST' })).then(
      (r) => {
        if (!r) return;
        setPayment(r.data);
        if (r.data.status !== 'PENDING') void reload();
      },
    );
  };
  const linkCard = () =>
    run(() => api<CardRegistrationStart>('/subscription/card', { method: 'POST' })).then((r) => {
      if (r) window.location.assign(r.data.redirectUrl);
    });
  const checkCard = () =>
    run(() => api<SubscriptionOverview>('/subscription/card/check', { method: 'POST' })).then((r) => r && setOv(r.data));
  const removeCard = () => {
    if (!window.confirm(t('subscription.cardRemoveConfirm'))) return;
    void run(() => api<SubscriptionOverview>('/subscription/card', { method: 'DELETE' })).then((r) => r && setOv(r.data));
  };

  if (!ov) {
    return (
      <main className="page">
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  const sub = ov.subscription;
  const canStart = !sub || sub.status === 'INCOMPLETE' || sub.status === 'PAUSED' || sub.status === 'CANCELED';
  const showPlans = !sub || sub.status === 'INCOMPLETE' || choosing;

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('subscription.title')}</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>{t('subscription.intro')}</p>
      {error && <p style={{ color: 'var(--err)', margin: 0 }}>{error}</p>}

      {sub && (
        <section className="card" style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{t('subscription.current')}</h2>
          <p style={{ margin: 0 }}>
            <strong>{sub.plan.name}</strong> · {t('subscription.perMonth', { price: formatNumber(sub.plan.priceMnt) })} ·{' '}
            {t('subscription.creditsPerMonth', { count: formatNumber(sub.plan.credits) })}
          </p>
          <p style={{ margin: 0 }}>
            {t('subscription.status')}:{' '}
            <span className={`badge-status sub-status-${sub.status.toLowerCase()}`}>
              {t(`subscription.status${sub.status}` as MessageKey)}
            </span>
          </p>
          {sub.currentPeriodStart && sub.currentPeriodEnd && sub.status !== 'CANCELED' && (
            <small>
              {t('subscription.period', { start: formatDate(sub.currentPeriodStart), end: formatDate(sub.currentPeriodEnd) })}
            </small>
          )}
          {sub.nextRenewalAt && <small>{t('subscription.nextRenewal', { date: formatDate(sub.nextRenewalAt) })}</small>}
          {sub.pauseAt && <small style={{ color: 'var(--err)' }}>{t('subscription.pauseAt', { date: formatDate(sub.pauseAt) })}</small>}
          {sub.status === 'CANCELED' && sub.currentPeriodEnd && (
            <small>{t('subscription.canceledUntil', { date: formatDate(sub.currentPeriodEnd) })}</small>
          )}
          {sub.status === 'PAUSED' && <small>{t('subscription.pausedInfo')}</small>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sub.status === 'PAST_DUE' && !ov.pendingPayment && (
              <button className="btn" disabled={busy} onClick={pay}>
                {t('subscription.pay')}
              </button>
            )}
            {(sub.status === 'PAUSED' || sub.status === 'CANCELED') && (
              <>
                <button className="btn" disabled={busy} onClick={reactivate}>
                  {t('subscription.reactivate')}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setChoosing((v) => !v)}>
                  {t('subscription.changePlan')}
                </button>
              </>
            )}
            {sub.status !== 'CANCELED' && (
              <button className="btn btn-ghost" disabled={busy} onClick={cancel}>
                {t('subscription.cancel')}
              </button>
            )}
          </div>
        </section>
      )}

      {payment && <PaymentPanel payment={payment} busy={busy} onCheck={check} onClose={() => setPayment(null)} />}

      {canStart && showPlans && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{t('subscription.plans')}</h2>
          {plans.length === 0 && <p style={{ margin: 0 }}>{t('subscription.noPlans')}</p>}
          <div className="grid-2">
            {plans.map((p) => (
              <button key={p.id} className="card package-card" disabled={busy} onClick={() => start(p)}>
                <strong>{p.name}</strong>
                <span>{t('subscription.creditsPerMonth', { count: formatNumber(p.credits) })}</span>
                <span>{t('subscription.perMonth', { price: formatNumber(p.priceMnt) })}</span>
              </button>
            ))}
          </div>
          {busy && <p style={{ margin: 0 }}>{t('subscription.working')}</p>}
        </section>
      )}

      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{t('subscription.card')}</h2>
        {!ov.cardSupported && !ov.card ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>{t('subscription.cardUnsupported')}</p>
        ) : ov.card?.status === 'ACTIVE' ? (
          <>
            <p style={{ margin: 0 }}>
              {t('subscription.cardActive', { brand: ov.card.brand ?? '', pan: ov.card.maskedPan ?? '' })}
            </p>
            <button className="btn btn-ghost" disabled={busy} onClick={removeCard}>
              {t('subscription.cardRemove')}
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>{ov.card ? t('subscription.cardPending') : t('subscription.cardNone')}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" disabled={busy} onClick={linkCard}>
                {t('subscription.cardLink')}
              </button>
              {ov.card && (
                <button className="btn btn-ghost" disabled={busy} onClick={checkCard}>
                  {t('subscription.cardCheck')}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function PaymentPanel({
  payment,
  busy,
  onCheck,
  onClose,
}: {
  payment: SubscriptionPaymentView;
  busy: boolean;
  onCheck: () => void;
  onClose: () => void;
}) {
  if (payment.status !== 'PENDING' || payment.method !== 'INVOICE') {
    const ok = payment.status === 'PAID';
    return (
      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0, color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: ok ? 700 : 400 }}>
          {ok
            ? t('subscription.paid', { count: formatNumber(payment.credits) })
            : t(payment.status === 'AMOUNT_MISMATCH' ? 'subscription.mismatch' : 'subscription.failed')}
        </p>
        <button className="btn btn-ghost" onClick={onClose}>
          {t('subscription.close')}
        </button>
      </section>
    );
  }
  return (
    <section className="card qpay-panel">
      <h2 style={{ margin: 0 }}>{t('subscription.payTitle', { amount: formatNumber(payment.amountMnt) })}</h2>
      <p style={{ margin: 0 }}>{t('subscription.scanQr')}</p>
      {payment.qrImage && (
        <img className="qpay-qr" src={`data:image/png;base64,${payment.qrImage}`} alt={t('subscription.qrAlt')} />
      )}
      {payment.deeplinks.length > 0 && (
        <div className="bank-links" aria-label={t('subscription.openBank')}>
          {payment.deeplinks.map((d) => (
            <a key={d.link} className="bank-link" href={d.link}>
              {d.logo && <img src={d.logo} alt="" width={32} height={32} />}
              <span>{d.description || d.name}</span>
            </a>
          ))}
        </div>
      )}
      <p style={{ margin: 0, color: 'var(--muted)' }}>{t('subscription.pending')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy} onClick={onCheck}>
          {busy ? t('subscription.checking') : t('subscription.check')}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          {t('subscription.close')}
        </button>
      </div>
    </section>
  );
}
