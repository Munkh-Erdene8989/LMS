'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { AdminUserDetail, CreditAdjustResult, EarningsAdjustResult } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const mnt = (n: number) => t('earnings.mnt', { amount: formatNumber(n) });
const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

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

  if (error && !u) return <main><p style={{ color: 'var(--err)' }}>{error}</p></main>;
  if (!u) return <main><p>{t('me.loading')}</p></main>;

  const test = <span className="pill" style={{ marginLeft: 6 }}>{t('adminOps.testPill')}</span>;

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <Link href="/admin/users">{t('adminOps.back')}</Link>
      <section className="card" style={{ display: 'grid', gap: 6 }}>
        <h1 style={{ margin: 0 }}>{u.name ?? t('admin.someone')}</h1>
        <p style={{ margin: 0 }}>{[u.phone, u.email].filter(Boolean).join(' · ')}</p>
        <p style={{ margin: 0 }}>
          {u.roles.map((r) => <span key={r} className="pill" style={{ marginRight: 6 }}>{r}</span>)}
          {u.blockedAt && <span className="pill" style={{ color: 'var(--err)' }}>{t('adminOps.blockedPill')}</span>}
        </p>
        <p style={{ margin: 0 }}><strong>{t('adminOps.creditBalance', { count: formatNumber(u.credits.balance) })}</strong></p>
        {u.subscription && (
          <p style={{ margin: 0 }}>
            {t('adminOps.subscription', { plan: u.subscription.planName, status: t(`adminOps.sub${u.subscription.status}` as MessageKey) })}
          </p>
        )}
        {u.blockedAt && (
          <p style={{ margin: 0, color: 'var(--err)' }}>
            {t('adminOps.blockedInfo', { date: formatDate(u.blockedAt), reason: u.blockedReason ?? '—' })}
          </p>
        )}
      </section>

      <BlockForm user={u} onDone={load} />
      <CreditAdjustForm user={u} onDone={load} />
      {u.earnings && <EarningsAdjustForm user={u} onDone={load} />}

      <Section title={t('adminOps.ledger')}>
        <Table
          head={[t('adminOps.colWhen'), t('adminOps.colType'), t('adminOps.colCredits'), t('adminOps.colReason')]}
          rows={u.ledger.map((e) => [
            formatDate(e.createdAt),
            <>{t(`adminOps.entry${e.type}` as MessageKey)}{e.isTest && test}</>,
            signed(e.amount),
            [e.reason, e.actor?.name].filter(Boolean).join(' · ') || '—',
          ])}
        />
      </Section>

      <Section title={t('adminOps.purchases')}>
        <Table
          head={[t('adminOps.colWhen'), t('adminOps.colItem'), t('adminOps.colCredits')]}
          rows={u.purchases.map((p) => [
            formatDate(p.createdAt),
            <>{p.lessonTitle ? t('adminOps.lessonOf', { lesson: p.lessonTitle, course: p.courseTitle }) : p.courseTitle}{p.isTest && test}</>,
            formatNumber(p.credits),
          ])}
        />
      </Section>

      <Section title={t('adminOps.payments')}>
        <Table
          head={[t('adminOps.colWhen'), t('adminOps.colPurpose'), t('adminOps.colAmount'), t('adminOps.colStatus')]}
          rows={u.payments.map((p) => [
            formatDate(p.createdAt),
            <>{t(`adminOps.purpose${p.purpose}` as MessageKey)} · {t(`adminOps.method${p.method}` as MessageKey)}{p.isTest && test}</>,
            <>{mnt(p.amountMnt)}{p.paidAmountMnt !== null && p.paidAmountMnt !== p.amountMnt && <small className="muted"> ({t('adminOps.paidAmount', { amount: formatNumber(p.paidAmountMnt) })})</small>}</>,
            <>{t(`adminOps.payStatus${p.status}` as MessageKey)}{p.failureReason && <small className="muted"> · {p.failureReason}</small>}</>,
          ])}
        />
      </Section>

      {u.earnings && (
        <Section title={t('adminOps.earningsRecent')}>
          <Table
            head={[t('adminOps.colWhen'), t('adminOps.colType'), t('adminOps.colAmount'), t('adminOps.colReason')]}
            rows={u.earnings.recent.map((e) => [
              formatDate(e.createdAt),
              <>{t(`adminOps.earn${e.type}` as MessageKey)}{e.isTest && test}</>,
              `${e.amountMnt > 0 ? '+' : ''}${mnt(e.amountMnt)}`,
              e.reason ?? '—',
            ])}
          />
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <p className="muted" style={{ margin: 0 }}>{t('adminOps.noRows')}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/** Хаах/нээх: шалтгаан заавал. */
function BlockForm({ user, onDone }: { user: AdminUserDetail; onDone: () => Promise<void> }) {
  const blocked = user.blockedAt !== null;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!window.confirm(t(blocked ? 'adminOps.unblockConfirm' : 'adminOps.blockConfirm'))) return;
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
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{t('adminOps.blockTitle')}</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: '1 1 260px' }} placeholder={t('adminOps.blockReason')} aria-label={t('adminOps.blockReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="button" className={blocked ? 'btn' : 'btn btn-ghost'} disabled={busy || reason.trim().length < 3} onClick={() => void submit()}>
          {t(blocked ? 'adminOps.unblock' : 'adminOps.block')}
        </button>
      </div>
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
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
    if (!valid || !window.confirm(confirmText(n))) return;
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
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {extra}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: '0 1 200px' }} type="number" step={1} inputMode="numeric" placeholder={deltaLabel} aria-label={deltaLabel} value={delta} onChange={(e) => setDelta(e.target.value)} />
        <input className="input" style={{ flex: '1 1 260px' }} placeholder={t('adminOps.reason')} aria-label={t('adminOps.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="button" className="btn" disabled={busy || !valid} onClick={() => void submit()}>
          {t('adminOps.apply')}
        </button>
      </div>
      {delta.trim() !== '' && !deltaValid && <p className="muted" style={{ margin: 0 }}>{t('adminOps.invalidDelta')}</p>}
      {ok && <p style={{ margin: 0 }}>{ok}</p>}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--err)' }}>
          {errorCode === 'EARNINGS_BELOW_LOCKED' && <strong>{t('adminOps.openPayoutError')}. </strong>}
          {error}
        </p>
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
      confirmText={(n) => t('adminOps.creditConfirm', { delta: signed(n) })}
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
      confirmText={(n) => t('adminOps.earningsConfirm', { amount: signed(n) })}
      doneText={(r) => t(r.replayed ? 'adminOps.adjustReplayed' : 'adminOps.adjustDone', { balance: mnt(r.balanceMnt) })}
      onDone={onDone}
      extra={
        <p style={{ margin: 0 }}>
          {t('adminOps.earningsSummary', { balance: formatNumber(e.balanceMnt), locked: formatNumber(e.lockedMnt), test: formatNumber(e.testBalanceMnt) })}
          {e.onHold && <span className="pill" style={{ marginLeft: 8, color: 'var(--err)' }}>{t('adminOps.onHold')}</span>}
        </p>
      }
    />
  );
}
