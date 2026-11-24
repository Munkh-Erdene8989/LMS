'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CardRegistrationStart,
  SubscriptionActionResult,
  SubscriptionOverview,
  SubscriptionPaymentView,
  SubscriptionPlanView,
} from '@lms/shared';
import { api, useApiFailure } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '@/app/ui/button';
import { useConfirm } from '@/app/ui/confirm';
import { EmptyState } from '@/app/ui/empty-state';
import { Skeleton } from '@/app/ui/skeleton';
import { useToast } from '@/app/ui/toast';
import { QPayDialog } from '@/app/credits/qpay-dialog';
import styles from './subscription.module.css';

const POLL_MS = 4_000;
/** Хуудас нээлттэй үед төлбөрийн төлөвийг хэр удаан автоматаар шалгах */
const POLL_LIMIT_MS = 15 * 60_000;

function creditsChanged(): void {
  window.dispatchEvent(new Event('credits:changed'));
}

export default function SubscriptionPage() {
  const fail = useApiFailure();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [ov, setOv] = useState<SubscriptionOverview | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanView[]>([]);
  const [payment, setPayment] = useState<SubscriptionPaymentView | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevStatus = useRef<string | null>(null);

  const onError = useCallback(
    (err: unknown) => {
      const msg = fail(err);
      if (msg) setError(msg);
    },
    [fail],
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

  // PENDING → PAID: toast + толгойн CreditPill шинэчлэх.
  useEffect(() => {
    const status = payment?.status ?? null;
    if (payment && prevStatus.current === 'PENDING' && status === 'PAID') {
      toast(t('creditsUi.paidToast', { count: formatNumber(payment.credits) }));
      creditsChanged();
    }
    prevStatus.current = status;
  }, [payment, toast]);

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    setError(null);
    setBusy(true);
    setBusyKey(key);
    try {
      return await fn();
    } catch (err) {
      onError(err);
      return null;
    } finally {
      setBusy(false);
      setBusyKey(null);
    }
  }

  function applyResult(r: SubscriptionActionResult | null) {
    if (!r) return;
    setOv(r.overview);
    setPayment(r.payment);
    setChoosing(false);
    toast(t('creditsUi.subscribed'));
    creditsChanged();
  }

  const start = (plan: SubscriptionPlanView) =>
    run(`plan:${plan.id}`, () =>
      api<SubscriptionActionResult>('/subscription', { method: 'POST', body: { planId: plan.id } }),
    ).then((r) => applyResult(r?.data ?? null));
  const reactivate = () =>
    run('reactivate', () => api<SubscriptionActionResult>('/subscription/reactivate', { method: 'POST' })).then((r) =>
      applyResult(r?.data ?? null),
    );
  const pay = () =>
    run('pay', () => api<SubscriptionActionResult>('/subscription/pay', { method: 'POST' })).then((r) =>
      applyResult(r?.data ?? null),
    );
  const cancel = async () => {
    const ok = await confirm({
      title: t('creditsUi.cancelTitle'),
      body: t('creditsUi.cancelBody'),
      confirmLabel: t('creditsUi.cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    const r = await run('cancel', () => api<SubscriptionOverview>('/subscription/cancel', { method: 'POST' }));
    if (r) {
      setOv(r.data);
      setPayment(null);
      toast(t('creditsUi.subscriptionCanceled'));
      creditsChanged();
    }
  };
  const check = () => {
    if (!payment) return;
    void run('check', () =>
      api<SubscriptionPaymentView>(`/subscription/payments/${payment.id}/check`, { method: 'POST' }),
    ).then((r) => {
      if (!r) return;
      setPayment(r.data);
      if (r.data.status !== 'PENDING') void reload();
    });
  };
  const linkCard = () =>
    run('card', () => api<CardRegistrationStart>('/subscription/card', { method: 'POST' })).then((r) => {
      if (r) window.location.assign(r.data.redirectUrl);
    });
  const checkCard = () =>
    run('cardCheck', () => api<SubscriptionOverview>('/subscription/card/check', { method: 'POST' })).then(
      (r) => r && setOv(r.data),
    );
  const removeCard = async () => {
    const ok = await confirm({
      title: t('creditsUi.cardRemoveTitle'),
      body: t('creditsUi.cardRemoveBody'),
      confirmLabel: t('creditsUi.cardRemoveConfirm'),
      danger: true,
    });
    if (!ok) return;
    const r = await run('cardRemove', () => api<SubscriptionOverview>('/subscription/card', { method: 'DELETE' }));
    if (r) {
      setOv(r.data);
      toast(t('creditsUi.cardRemoved'));
    }
  };

  if (!ov) {
    return (
      <div className="page-narrow">
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : (
          <div className={styles.stack} aria-busy="true" aria-label={t('me.loading')}>
            <Skeleton height={28} width="40%" />
            <Skeleton height={160} radius="var(--r-lg)" />
            <Skeleton height={120} radius="var(--r-lg)" />
          </div>
        )}
      </div>
    );
  }

  const sub = ov.subscription;
  const canStart = !sub || sub.status === 'INCOMPLETE' || sub.status === 'PAUSED' || sub.status === 'CANCELED';
  const showPlans = !sub || sub.status === 'INCOMPLETE' || choosing;

  // Карт/автомат төлбөр эсвэл дууссан нэхэмжлэх: QR-гүй үр дүнгийн мессеж.
  const dialogStatus = payment
    ? payment.method === 'INVOICE'
      ? payment.status
      : payment.status === 'PAID'
        ? 'PAID'
        : 'FAILED'
    : 'PENDING';

  return (
    <div className={`page-narrow ${styles.stack}`}>
      <div className={styles.section}>
        <h1 className={styles.title}>{t('subscription.title')}</h1>
        <p className={styles.muted}>{t('subscription.intro')}</p>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {sub && (
        <section className={styles.panel} aria-labelledby="sub-current">
          <h2 id="sub-current" className={styles.h2}>
            {t('subscription.current')}
          </h2>
          <p className={styles.summary}>
            <strong>{sub.plan.name}</strong> · {t('subscription.perMonth', { price: formatMnt(sub.plan.priceMnt) })} ·{' '}
            {t('subscription.creditsPerMonth', { count: formatNumber(sub.plan.credits) })}
          </p>
          <p className={styles.summary}>
            {t('subscription.status')}:{' '}
            <span className={`${styles.badge} ${styles[`status${sub.status}` as keyof typeof styles] ?? ''}`}>
              {t(`subscription.status${sub.status}` as MessageKey)}
            </span>
          </p>
          <div className={styles.meta}>
            {sub.currentPeriodStart && sub.currentPeriodEnd && sub.status !== 'CANCELED' && (
              <span>
                {t('subscription.period', {
                  start: formatDate(sub.currentPeriodStart),
                  end: formatDate(sub.currentPeriodEnd),
                })}
              </span>
            )}
            {sub.nextRenewalAt && <span>{t('subscription.nextRenewal', { date: formatDate(sub.nextRenewalAt) })}</span>}
            {sub.pauseAt && <span className={styles.warn}>{t('subscription.pauseAt', { date: formatDate(sub.pauseAt) })}</span>}
            {sub.status === 'CANCELED' && sub.currentPeriodEnd && (
              <span>{t('subscription.canceledUntil', { date: formatDate(sub.currentPeriodEnd) })}</span>
            )}
            {sub.status === 'PAUSED' && <span>{t('subscription.pausedInfo')}</span>}
          </div>
          <div className={styles.actions}>
            {sub.status === 'PAST_DUE' && !ov.pendingPayment && (
              <Button loading={busyKey === 'pay'} disabled={busy} onClick={() => void pay()}>
                {t('subscription.pay')}
              </Button>
            )}
            {(sub.status === 'PAUSED' || sub.status === 'CANCELED') && (
              <>
                <Button loading={busyKey === 'reactivate'} disabled={busy} onClick={() => void reactivate()}>
                  {t('subscription.reactivate')}
                </Button>
                <Button variant="ghost" disabled={busy} aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>
                  {t('subscription.changePlan')}
                </Button>
              </>
            )}
            {sub.status !== 'CANCELED' && (
              <Button variant="ghost" loading={busyKey === 'cancel'} disabled={busy} onClick={() => void cancel()}>
                {t('subscription.cancel')}
              </Button>
            )}
          </div>
        </section>
      )}

      {canStart && showPlans && (
        <section className={styles.section} aria-labelledby="sub-plans">
          <h2 id="sub-plans" className={styles.h2}>
            {t('subscription.plans')}
          </h2>
          {plans.length === 0 ? (
            <EmptyState title={t('subscription.noPlans')} />
          ) : (
            <ul className={styles.plans}>
              {plans.map((p) => {
                const current = sub?.plan.id === p.id && sub.status === 'ACTIVE';
                return (
                  <li key={p.id}>
                    <article className={`${styles.plan} ${current ? styles.planCurrent : ''}`}>
                      <span className={styles.planName}>
                        {p.name}{' '}
                        {current && <span className={`${styles.badge} ${styles.statusACTIVE}`}>{t('creditsUi.planActive')}</span>}
                      </span>
                      <span className={styles.planPrice}>{t('subscription.perMonth', { price: formatMnt(p.priceMnt) })}</span>
                      <span className={styles.planCredits}>{t('subscription.creditsPerMonth', { count: formatNumber(p.credits) })}</span>
                      <Button
                        variant={current ? 'secondary' : 'primary'}
                        loading={busyKey === `plan:${p.id}`}
                        loadingLabel={t('subscription.working')}
                        disabled={busy || current}
                        onClick={() => void start(p)}
                      >
                        {t('subscription.choose')}
                      </Button>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className={styles.panel} aria-labelledby="sub-card">
        <h2 id="sub-card" className={styles.h2}>
          {t('subscription.card')}
        </h2>
        {!ov.cardSupported && !ov.card ? (
          <p className={styles.muted}>{t('subscription.cardUnsupported')}</p>
        ) : ov.card?.status === 'ACTIVE' ? (
          <>
            <p className={styles.summary}>
              {t('subscription.cardActive', { brand: ov.card.brand ?? '', pan: ov.card.maskedPan ?? '' })}
            </p>
            <div className={styles.actions}>
              <Button variant="ghost" loading={busyKey === 'cardRemove'} disabled={busy} onClick={() => void removeCard()}>
                {t('subscription.cardRemove')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.summary}>{ov.card ? t('subscription.cardPending') : t('subscription.cardNone')}</p>
            <div className={styles.actions}>
              <Button loading={busyKey === 'card'} disabled={busy} onClick={() => void linkCard()}>
                {t('subscription.cardLink')}
              </Button>
              {ov.card && (
                <Button variant="ghost" loading={busyKey === 'cardCheck'} disabled={busy} onClick={() => void checkCard()}>
                  {t('subscription.cardCheck')}
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      {payment && (
        <QPayDialog
          open
          status={dialogStatus}
          amountMnt={payment.amountMnt}
          qrImage={payment.qrImage}
          deeplinks={payment.deeplinks}
          busy={busyKey === 'check'}
          labels={{
            title: t('subscription.payTitle', { amount: '{amount}' }),
            scan: t('subscription.scanQr'),
            qrAlt: t('subscription.qrAlt'),
            openBank: t('subscription.openBank'),
            pending: t('subscription.pending'),
            result:
              dialogStatus === 'PAID'
                ? t('subscription.paid', { count: formatNumber(payment.credits) })
                : t(payment.status === 'AMOUNT_MISMATCH' ? 'subscription.mismatch' : 'subscription.failed'),
            check: t('subscription.check'),
            checking: t('subscription.checking'),
            close: t('subscription.close'),
          }}
          onCheck={check}
          onClose={() => setPayment(null)}
        />
      )}
    </div>
  );
}
