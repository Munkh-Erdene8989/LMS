'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminPayoutPage, AdminPayoutView, PayoutHoldView, PayoutStatus } from '@lms/shared';
import { api, apiDownload } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { ErrorLine, FilterTabs, LoadingRows, Pill, ReasonDialog, errorText } from '../admin-ui';
import styles from '../admin.module.css';

const STATUSES: PayoutStatus[] = ['REQUESTED', 'PAID', 'REJECTED'];

/** Payout дараалал: CSV export → банкаар гараар шилжүүлэх → "төлсөн"; татгалзах; багшийн hold. */
export default function AdminPayoutsPage() {
  const [status, setStatus] = useState<PayoutStatus>('REQUESTED');
  const [items, setItems] = useState<AdminPayoutView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [holds, setHolds] = useState<PayoutHoldView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [page, h] = await Promise.all([
        api<AdminPayoutPage>(`/admin/payouts?status=${status}`),
        api<PayoutHoldView[]>('/admin/payouts/holds'),
      ]);
      setItems(page.data.items);
      setCursor(page.data.nextCursor);
      setHolds(h.data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [status]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<AdminPayoutPage>(`/admin/payouts?status=${status}&before=${cursor}`);
      setItems((prev) => [...(prev ?? []), ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function exportCsv() {
    setError(null);
    try {
      await apiDownload('/admin/payouts/export.csv', `payouts-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function release(teacherId: string) {
    try {
      await api(`/admin/payouts/holds/${teacherId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const total = items?.reduce((s, p) => s + p.amountMnt, 0) ?? 0;

  return (
    <div className={styles.stackLg}>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('payout.adminTitle')}</h1>
        <FilterTabs
          label={t('payout.adminTitle')}
          value={status}
          onChange={setStatus}
          items={STATUSES.map((s) => ({ key: s, label: t(`payout.tab${s}` as MessageKey) }))}
        />
        {status === 'REQUESTED' && items && items.length > 0 && (
          <div className={styles.toolbar}>
            <Button onClick={() => void exportCsv()}>{t('payout.exportCsv')}</Button>
            <span className={styles.muted}>{t('payout.queueTotal', { count: items.length, amount: formatMnt(total) })}</span>
          </div>
        )}
        {status === 'REQUESTED' && <p className={styles.hint}>{t('payout.adminHint')}</p>}
        {error && <ErrorLine>{error}</ErrorLine>}
        {!items && !error && <LoadingRows />}
        {items?.length === 0 && <EmptyState title={t('payout.adminEmpty')} />}
        {!!items?.length && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{t('payout.adminTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.num}>
                    {t('adminUi.colAmount')}
                  </th>
                  <th scope="col">{t('payout.teacher')}</th>
                  <th scope="col">{t('adminUi.colBank')}</th>
                  <th scope="col">{t('adminOps.colStatus')}</th>
                  <th scope="col" className={styles.actions}>
                    {t('adminUi.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <PayoutRow key={p.id} payout={p} onDone={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <div>
            <Button variant="secondary" onClick={() => void more()}>
              {t('admin.loadMore')}
            </Button>
          </div>
        )}
      </div>

      <section className={styles.stack} aria-labelledby="payout-holds-title">
        <h2 id="payout-holds-title" className={styles.subtitle}>
          {t('payout.holdsTitle')}
        </h2>
        {holds.length === 0 ? (
          <p className={styles.hint}>{t('payout.holdsEmpty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{t('payout.holdsTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('payout.teacher')}</th>
                  <th scope="col">{t('teacher.reason')}</th>
                  <th scope="col">{t('admin.when')}</th>
                  <th scope="col" className={styles.actions}>
                    {t('adminUi.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {holds.map((h) => (
                  <tr key={h.teacher.id}>
                    <td className={styles.wrap}>{contactLine(h.teacher)}</td>
                    <td className={`${styles.wrap} ${styles.pre}`}>{h.reason}</td>
                    <td>
                      {formatDate(h.createdAt)}
                      {h.createdBy && <small className={styles.muted}> · {h.createdBy.name ?? t('admin.someone')}</small>}
                    </td>
                    <td className={styles.actions}>
                      <Button variant="secondary" size="sm" onClick={() => void release(h.teacher.id)}>
                        {t('payout.release')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function contactLine(u: AdminPayoutView['teacher']): string {
  return [u.name ?? t('admin.someone'), u.phone, u.email].filter(Boolean).join(' · ');
}

function PayoutRow({ payout: p, onDone }: { payout: AdminPayoutView; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'paid' | 'reject' | 'hold' | null>(null);

  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method, body });
      await onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td className={styles.num}>
        <strong>{formatMnt(p.amountMnt)}</strong>
        <div className={`${styles.muted} ${styles.small}`}>{t('payout.requestedOn', { date: formatDate(p.requestedAt) })}</div>
      </td>
      <td className={styles.wrap}>
        {contactLine(p.teacher)}
        {p.onHold && (
          <span className={styles.pills}>
            <Pill tone="err">{t('payout.onHold')}</Pill>
          </span>
        )}
        <div className={`${styles.muted} ${styles.small}`}>{t('payout.teacherBalance', { amount: formatMnt(p.teacherBalanceMnt) })}</div>
      </td>
      <td className={styles.wrap}>
        {t(`banks.${p.bank}` as MessageKey)} · <code>{p.accountNumber}</code> · {p.holderName}
      </td>
      <td className={styles.wrap}>
        {p.status === 'REQUESTED' ? (
          <Pill tone="warn">{t(`payout.status${p.status}` as MessageKey)}</Pill>
        ) : (
          <>
            <Pill tone={p.status === 'PAID' ? 'ok' : 'err'}>{t(`payout.status${p.status}` as MessageKey)}</Pill>{' '}
            {p.processedAt && formatDate(p.processedAt)}
            {p.processedBy && ` · ${p.processedBy.name ?? t('admin.someone')}`}
            {p.transferRef && ` · ${p.transferRef}`}
            {p.rejectReason && ` · ${p.rejectReason}`}
          </>
        )}
        {error && <ErrorLine>{error}</ErrorLine>}
      </td>
      <td className={styles.actions}>
        <span className={styles.rowActions}>
          {p.status === 'REQUESTED' && (
            <>
              <Button size="sm" disabled={busy || p.onHold} onClick={() => setDialog('paid')}>
                {t('payout.markPaid')}
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDialog('reject')}>
                {t('payout.reject')}
              </Button>
            </>
          )}
          {!p.onHold && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDialog('hold')}>
              {t('payout.hold')}
            </Button>
          )}
        </span>
        <ReasonDialog
          open={dialog === 'paid'}
          onClose={() => setDialog(null)}
          title={t('payout.markPaid')}
          description={t('payout.paidConfirm', { amount: formatMnt(p.amountMnt) })}
          label={t('payout.transferRef')}
          confirmLabel={t('payout.markPaid')}
          danger
          minLength={0}
          multiline={false}
          onSubmit={(ref) => act(`/admin/payouts/${p.id}/paid`, 'POST', ref ? { transferRef: ref } : {})}
        />
        <ReasonDialog
          open={dialog === 'reject'}
          onClose={() => setDialog(null)}
          title={t('payout.reject')}
          label={t('payout.rejectReason')}
          confirmLabel={t('payout.reject')}
          danger
          onSubmit={(reason) => act(`/admin/payouts/${p.id}/reject`, 'POST', { reason })}
        />
        <ReasonDialog
          open={dialog === 'hold'}
          onClose={() => setDialog(null)}
          title={t('payout.hold')}
          label={t('payout.holdReason')}
          confirmLabel={t('payout.hold')}
          onSubmit={(reason) => act(`/admin/payouts/holds/${p.teacher.id}`, 'PUT', { reason })}
        />
      </td>
    </tr>
  );
}
