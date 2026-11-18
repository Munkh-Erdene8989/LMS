'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PAYMENT_ISSUE_KINDS } from '@lms/shared';
import type { AdminPaymentRow, PaymentIssueKind, PaymentIssueView, PaymentIssuesView, ReconcileCanceledResult } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { EmptyState } from '../../ui/empty-state';
import { useToast } from '../../ui/toast';
import { ErrorLine, FilterTabs, LoadingRows, Pill, ReasonDialog, errorText } from '../admin-ui';
import styles from '../admin.module.css';

type Kind = PaymentIssueKind | 'ALL';

/** Асуудалтай төлбөр: дахин шалгах, олгох/хаах (мөнгөний үйлдэл, баталгаажуулалттай), цуцалсныг тулгах. */
export default function AdminPaymentIssuesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<PaymentIssuesView | null>(null);
  const [kind, setKind] = useState<Kind>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await api<PaymentIssuesView>('/admin/payments/issues')).data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile() {
    const ok = await confirm({ title: t('adminOps.reconcile'), body: t('adminOps.reconcileConfirm'), confirmLabel: t('adminOps.reconcile') });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<ReconcileCanceledResult>('/admin/payments/reconcile-canceled', { method: 'POST' });
      toast.toast(t('adminOps.reconcileDone', { checked: r.data.checked, found: r.data.found, failed: r.data.failed }));
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items.filter((i) => kind === 'ALL' || i.kind === kind) ?? [];

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('adminOps.paymentsTitle')}</h1>
      <p className={styles.hint}>
        {t('adminOps.paymentsHint')} {data && t('adminOps.staleHint', { minutes: data.staleMinutes })}
      </p>
      <div className={styles.toolbar}>
        <FilterTabs
          label={t('adminOps.paymentsTitle')}
          value={kind}
          onChange={setKind}
          items={[
            { key: 'ALL' as Kind, label: `${t('adminOps.kindAll')}${data ? ` (${data.items.length})` : ''}` },
            ...PAYMENT_ISSUE_KINDS.map((k) => ({ key: k as Kind, label: `${t(`adminOps.kind${k}` as MessageKey)}${data ? ` (${data.counts[k] ?? 0})` : ''}` })),
          ]}
        />
        <span className={styles.spacer} />
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void reconcile()}>
          {t('adminOps.reconcile')}
        </Button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <LoadingRows />}
      {data && items.length === 0 && <EmptyState title={t('adminOps.noIssues')} />}
      {items.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{t('adminOps.paymentsTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('adminUi.colKind')}</th>
                <th scope="col" className={styles.num}>
                  {t('adminUi.colAmount')}
                </th>
                <th scope="col">{t('adminUi.colUser')}</th>
                <th scope="col">{t('adminOps.colStatus')}</th>
                <th scope="col">{t('admin.when')}</th>
                <th scope="col" className={styles.actions}>
                  {t('adminUi.colActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <IssueRow key={p.id} issue={p} onDone={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue: p, onDone }: { issue: PaymentIssueView; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<'GRANT' | 'CLOSE' | null>(null);
  const who = [p.user.name ?? t('admin.someone'), p.user.phone, p.user.email].filter(Boolean).join(' · ');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const recheck = () =>
    run(async () => {
      const r = await api<AdminPaymentRow>(`/admin/payments/${p.id}/recheck`, { method: 'POST' });
      toast.toast(t('adminOps.recheckDone', { status: t(`adminOps.payStatus${r.data.status}` as MessageKey) }));
      await onDone();
    });

  return (
    <tr>
      <td className={styles.nowrap}>
        <Pill tone="warn">{t(`adminOps.kind${p.kind}` as MessageKey)}</Pill>
        {p.isTest && (
          <span className={styles.pills}>
            <Pill tone="neutral">{t('adminOps.testPill')}</Pill>
          </span>
        )}
      </td>
      <td className={styles.num}>{formatMnt(p.amountMnt)}</td>
      <td className={styles.wrap}>
        <Link className={styles.anchor} href={`/admin/users/${p.user.id}`}>
          {who}
        </Link>
        <div className={`${styles.muted} ${styles.small}`}>
          {t(`adminOps.purpose${p.purpose}` as MessageKey)} · {t(`adminOps.method${p.method}` as MessageKey)} · {t('adminOps.colCredits')}:{' '}
          {formatNumber(p.credits)}
          {p.paidAmountMnt !== null && ` · ${t('adminOps.paidAmount', { amount: formatNumber(p.paidAmountMnt) })}`}
          {p.providerInvoiceId && (
            <>
              {' '}
              · <code>{p.providerInvoiceId}</code>
            </>
          )}
          {p.providerPaymentId && (
            <>
              {' '}
              · <code>{p.providerPaymentId}</code>
            </>
          )}
          {p.failureReason && ` · ${p.failureReason}`}
        </div>
        {error && <ErrorLine>{error}</ErrorLine>}
      </td>
      <td className={styles.wrap}>
        {t(`adminOps.payStatus${p.status}` as MessageKey)}
        {p.resolution && (
          <div className={`${styles.muted} ${styles.small}`}>
            {t('adminOps.resolved', { resolution: t(`adminOps.res${p.resolution}` as MessageKey) })}
            {p.resolutionNote && ` · ${p.resolutionNote}`}
          </div>
        )}
      </td>
      <td className={styles.nowrap}>{formatDate(p.createdAt)}</td>
      <td className={styles.actions}>
        <span className={styles.rowActions}>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void recheck()}>
            {t('adminOps.recheck')}
          </Button>
          {!p.resolution && (
            <>
              <Button size="sm" disabled={busy} onClick={() => setResolving('GRANT')}>
                {t('adminOps.grant')}
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setResolving('CLOSE')}>
                {t('adminOps.close')}
              </Button>
            </>
          )}
        </span>
        <ReasonDialog
          open={resolving !== null}
          onClose={() => setResolving(null)}
          title={resolving === 'GRANT' ? t('adminOps.grant') : t('adminOps.close')}
          description={resolving === 'GRANT' ? t('adminOps.grantConfirm', { credits: formatNumber(p.credits), user: who }) : t('adminOps.closeConfirm')}
          label={t('adminOps.resolveNote')}
          confirmLabel={resolving === 'GRANT' ? t('adminOps.grant') : t('adminOps.close')}
          danger={resolving === 'GRANT'}
          minLength={3}
          multiline={false}
          onSubmit={(note) =>
            run(async () => {
              await api(`/admin/payments/${p.id}/resolve`, { method: 'POST', body: { action: resolving, note } });
              await onDone();
            })
          }
        />
      </td>
    </tr>
  );
}
