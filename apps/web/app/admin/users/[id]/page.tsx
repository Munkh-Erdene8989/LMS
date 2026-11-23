'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { AdminUserDetail, CreditAdjustResult, EarningsAdjustResult } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatDelta, formatMnt, formatMntDelta, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../../ui/button';
import { useConfirm } from '../../../ui/confirm';
import { EmptyValue } from '../../../ui/empty-value';
import { ErrorLine, LoadingRows, Pill, errorText } from '../../admin-ui';
import styles from '../../admin.module.css';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setU((await api<AdminUserDetail>(`/admin/users/${id}`)).data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !u) return <ErrorLine>{error}</ErrorLine>;
  if (!u) return <LoadingRows />;

  const test = (
    <span className={styles.pills}>
      <Pill tone="neutral">{t('adminOps.testPill')}</Pill>
    </span>
  );

  return (
    <div className={styles.stackLg}>
      <Link href="/admin/users" className={`${styles.back} ${styles.anchor}`}>
        {t('adminOps.back')}
      </Link>
      <section className={styles.item}>
        <h1 className={styles.title}>{u.name ?? t('admin.someone')}</h1>
        <p className={styles.line}>{[u.phone, u.email].filter(Boolean).join(' · ')}</p>
        <p className={styles.toolbar}>
          {u.roles.map((r) => (
            <Pill key={r} tone="neutral">
              {r}
            </Pill>
          ))}
          {u.blockedAt && <Pill tone="err">{t('adminOps.blockedPill')}</Pill>}
        </p>
        <p className={styles.line}>
          <strong>{t('adminOps.creditBalance', { count: formatNumber(u.credits.balance) })}</strong>
        </p>
        {u.subscription && (
          <p className={styles.line}>
            {t('adminOps.subscription', { plan: u.subscription.planName, status: t(`adminOps.sub${u.subscription.status}` as MessageKey) })}
          </p>
        )}
        {u.blockedAt && (
          <p className={`${styles.line} ${styles.error}`}>
            {t('adminOps.blockedInfo', { date: formatDate(u.blockedAt), reason: u.blockedReason ?? '—' })}
          </p>
        )}
      </section>

      <BlockForm user={u} onDone={load} />
      <CreditAdjustForm user={u} onDone={load} />
      {u.earnings && <EarningsAdjustForm user={u} onDone={load} />}

      <Section title={t('adminOps.ledger')}>
        <Table
          title={t('adminOps.ledger')}
          head={[{ label: t('adminOps.colWhen') }, { label: t('adminOps.colType') }, { label: t('adminOps.colCredits'), num: true }, { label: t('adminOps.colReason') }]}
          ids={u.ledger.map((x) => x.id)}
          rows={u.ledger.map((e) => [
            formatDate(e.createdAt),
            <>
              {t(`adminOps.entry${e.type}` as MessageKey)}
              {e.isTest && test}
            </>,
            formatDelta(e.amount),
            [e.reason, e.actor?.name].filter(Boolean).join(' · ') || <EmptyValue />,
          ])}
        />
      </Section>

      <Section title={t('adminOps.purchases')}>
        <Table
          title={t('adminOps.purchases')}
          head={[{ label: t('adminOps.colWhen') }, { label: t('adminOps.colItem') }, { label: t('adminOps.colCredits'), num: true }]}
          ids={u.purchases.map((x) => x.id)}
          rows={u.purchases.map((p) => [
            formatDate(p.createdAt),
            <>
              {p.lessonTitle ? t('adminOps.lessonOf', { lesson: p.lessonTitle, course: p.courseTitle }) : p.courseTitle}
              {p.isTest && test}
            </>,
            formatNumber(p.credits),
          ])}
        />
      </Section>

      <Section title={t('adminOps.payments')}>
        <Table
          title={t('adminOps.payments')}
          head={[{ label: t('adminOps.colWhen') }, { label: t('adminOps.colPurpose') }, { label: t('adminOps.colAmount'), num: true }, { label: t('adminOps.colStatus') }]}
          ids={u.payments.map((x) => x.id)}
          rows={u.payments.map((p) => [
            formatDate(p.createdAt),
            <>
              {t(`adminOps.purpose${p.purpose}` as MessageKey)} · {t(`adminOps.method${p.method}` as MessageKey)}
              {p.isTest && test}
            </>,
            <>
              {formatMnt(p.amountMnt)}
              {p.paidAmountMnt !== null && p.paidAmountMnt !== p.amountMnt && (
                <small className={styles.muted}> ({t('adminOps.paidAmount', { amount: formatMnt(p.paidAmountMnt) })})</small>
              )}
            </>,
            <>
              {t(`adminOps.payStatus${p.status}` as MessageKey)}
              {p.failureReason && <small className={styles.muted}> · {p.failureReason}</small>}
            </>,
          ])}
        />
      </Section>

      {u.earnings && (
        <Section title={t('adminOps.earningsRecent')}>
          <Table
            title={t('adminOps.earningsRecent')}
            head={[{ label: t('adminOps.colWhen') }, { label: t('adminOps.colType') }, { label: t('adminOps.colAmount'), num: true }, { label: t('adminOps.colReason') }]}
            ids={u.earnings.recent.map((x) => x.id)}
            rows={u.earnings.recent.map((e) => [
              formatDate(e.createdAt),
              <>
                {t(`adminOps.earn${e.type}` as MessageKey)}
                {e.isTest && test}
              </>,
              formatMntDelta(e.amountMnt),
              e.reason ?? <EmptyValue />,
            ])}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.stack}>
      <h2 className={styles.subtitle}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ title, head, ids, rows }: { title: string; head: { label: string; num?: boolean }[]; ids: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <p className={styles.hint}>{t('adminOps.noRows')}</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{title}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label} scope="col" className={h.num ? styles.num : undefined}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={ids[i]}>
              {r.map((c, j) => (
                <td key={j} className={head[j]?.num ? styles.num : j === 0 ? styles.nowrap : styles.wrap}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Хаах/нээх: шалтгаан заавал. */
function BlockForm({ user, onDone }: { user: AdminUserDetail; onDone: () => Promise<void> }) {
  const confirm = useConfirm();
  const blocked = user.blockedAt !== null;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const ok = await confirm({
      title: t(blocked ? 'adminOps.unblock' : 'adminOps.block'),
      body: t(blocked ? 'adminOps.unblockConfirm' : 'adminOps.blockConfirm'),
      confirmLabel: t(blocked ? 'adminOps.unblock' : 'adminOps.block'),
      danger: !blocked,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/users/${user.id}/${blocked ? 'unblock' : 'block'}`, { method: 'POST', body: { reason: reason.trim() } });
      setReason('');
      await onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.item} aria-labelledby="block-title">
      <h2 id="block-title" className={styles.subtitle}>
        {t('adminOps.blockTitle')}
      </h2>
      <div className={styles.formRow}>
        <input
          className={`input ${styles.grow}`}
          autoComplete="off"
          placeholder={t('adminOps.blockReason')}
          aria-label={t('adminOps.blockReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button variant={blocked ? 'primary' : 'secondary'} disabled={reason.trim().length < 3} loading={busy} onClick={() => void submit()}>
          {t(blocked ? 'adminOps.unblock' : 'adminOps.block')}
        </Button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </section>
  );
}

interface AdjustProps<R> {
  title: string;
  deltaLabel: string;
  path: string;
  bodyKey: 'delta' | 'amountMnt';
  confirmText: (n: number) => string;
  doneText: (r: R) => string;
  onDone: () => Promise<void>;
  extra?: ReactNode;
}

/**
 * Нэг idempotencyKey нь нэг засварт: амжилттай болтол хадгалагдана (сүлжээний алдаанд дахин
 * илгээхэд давхар бичилт үүсэхгүй), амжилттай болсны дараа эсвэл түлхүүр зөрчилдвөл шинээр үүснэ.
 */
function AdjustForm<R>({ title, deltaLabel, path, bodyKey, confirmText, doneText, onDone, extra }: AdjustProps<R>) {
  const confirm = useConfirm();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const n = Number(delta);
  const deltaValid = Number.isInteger(n) && n !== 0;
  const valid = delta.trim() !== '' && deltaValid && reason.trim().length >= 3;

  async function submit() {
    if (!valid) return;
    const yes = await confirm({ title, body: confirmText(n), confirmLabel: t('adminOps.apply'), danger: n < 0 });
    if (!yes) return;
    setBusy(true);
    setError(null);
    setErrorCode(null);
    setOk(null);
    try {
      const r = await api<R>(path, { method: 'POST', body: { [bodyKey]: n, reason: reason.trim(), idempotencyKey: key } });
      setOk(doneText(r.data));
      setDelta('');
      setReason('');
      setKey(crypto.randomUUID());
      await onDone();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiRequestError) {
        setErrorCode(err.code ?? null);
        if (err.code === 'IDEMPOTENCY_CONFLICT') setKey(crypto.randomUUID());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.item}>
      <h2 className={styles.subtitle}>{title}</h2>
      {extra}
      <div className={styles.formRow}>
        <input
          className={`input ${styles.narrowField}`}
          type="number"
          step={1}
          inputMode="numeric"
          placeholder={deltaLabel}
          aria-label={deltaLabel}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <input
          className={`input ${styles.grow}`}
          autoComplete="off"
          placeholder={t('adminOps.reason')}
          aria-label={t('adminOps.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button disabled={!valid} loading={busy} onClick={() => void submit()}>
          {t('adminOps.apply')}
        </Button>
      </div>
      {delta.trim() !== '' && !deltaValid && <p className={styles.hint}>{t('adminOps.invalidDelta')}</p>}
      {ok && (
        <p className={styles.info} role="status">
          {ok}
        </p>
      )}
      {error && (
        <ErrorLine>
          {errorCode === 'EARNINGS_BELOW_LOCKED' && <strong>{t('adminOps.openPayoutError')}. </strong>}
          {error}
        </ErrorLine>
      )}
    </section>
  );
}

function CreditAdjustForm({ user, onDone }: { user: AdminUserDetail; onDone: () => Promise<void> }) {
  return (
    <AdjustForm<CreditAdjustResult>
      title={t('adminOps.creditAdjustTitle')}
      deltaLabel={t('adminOps.creditDelta')}
      path={`/admin/users/${user.id}/credits/adjust`}
      bodyKey="delta"
      confirmText={(n) => t('adminOps.creditConfirm', { delta: formatDelta(n) })}
      doneText={(r) => t(r.replayed ? 'adminOps.adjustReplayed' : 'adminOps.adjustDone', { balance: formatNumber(r.balance) })}
      onDone={onDone}
    />
  );
}

function EarningsAdjustForm({ user, onDone }: { user: AdminUserDetail; onDone: () => Promise<void> }) {
  const e = user.earnings;
  if (!e) return null;
  return (
    <AdjustForm<EarningsAdjustResult>
      title={t('adminOps.earningsAdjustTitle')}
      deltaLabel={t('adminOps.earningsDelta')}
      path={`/admin/users/${user.id}/earnings/adjust`}
      bodyKey="amountMnt"
      confirmText={(n) => t('adminOps.earningsConfirm', { amount: formatMntDelta(n) })}
      doneText={(r) => t(r.replayed ? 'adminOps.adjustReplayed' : 'adminOps.adjustDone', { balance: formatMnt(r.balanceMnt) })}
      onDone={onDone}
      extra={
        <p className={styles.line}>
          {t('adminOps.earningsSummary', { balance: formatMnt(e.balanceMnt), locked: formatMnt(e.lockedMnt), test: formatMnt(e.testBalanceMnt) })}
          {e.onHold && (
            <span className={styles.pills}>
              <Pill tone="err">{t('adminOps.onHold')}</Pill>
            </span>
          )}
        </p>
      }
    />
  );
}
