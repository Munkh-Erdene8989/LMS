'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminTeacherApplicationView, TeacherApplicationStatus } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { useToast } from '../../ui/toast';
import { ErrorLine, FilterTabs, LoadingRows, ReasonDialog, errorText } from '../admin-ui';
import styles from '../admin.module.css';

const STATUSES: TeacherApplicationStatus[] = ['SUBMITTED', 'REJECTED', 'APPROVED'];

export default function AdminTeacherApplicationsPage() {
  const [status, setStatus] = useState<TeacherApplicationStatus>('SUBMITTED');
  const [items, setItems] = useState<AdminTeacherApplicationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      setItems((await api<AdminTeacherApplicationView[]>(`/admin/teacher-applications?status=${status}`)).data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('teacher.adminTitle')}</h1>
      <FilterTabs
        label={t('teacher.adminTitle')}
        value={status}
        onChange={setStatus}
        items={STATUSES.map((s) => ({ key: s, label: t(`teacher.tab${s}` as MessageKey) }))}
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('teacher.adminEmpty')} />}
      {items?.map((a) => <ApplicationCard key={a.id} app={a} onDone={load} />)}
    </div>
  );
}

function ApplicationCard({ app, onDone }: { app: AdminTeacherApplicationView; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  async function act(path: 'approve' | 'reject', reason?: string) {
    setError(null);
    try {
      await api(`/admin/teacher-applications/${app.id}/${path}`, {
        method: 'POST',
        body: path === 'reject' ? { reason } : undefined,
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className={styles.item} aria-label={app.displayName}>
      <div className={styles.itemHead}>
        <strong>{app.displayName}</strong>
        <span className={`${styles.muted} ${styles.small}`}>{t('teacher.submittedAt', { date: formatDate(app.submittedAt) })}</span>
      </div>
      <p className={styles.line}>
        <strong>{t('teacher.contact')}:</strong> {[app.user.phone, app.user.email].filter(Boolean).join(' · ')}
      </p>
      <p className={styles.line}>
        <strong>{t('teacher.expertise')}:</strong> {app.expertise}
      </p>
      <p className={`${styles.line} ${styles.pre}`}>{app.bio}</p>
      <p className={styles.line}>
        <a className={styles.anchor} href={app.sampleUrl} target="_blank" rel="noreferrer noopener">
          {app.sampleUrl}
        </a>
      </p>
      {app.bankAccount && (
        <p className={styles.line}>
          <strong>{t('teacher.bank')}:</strong> {t(`banks.${app.bankAccount.bank}` as MessageKey)} · {app.bankAccount.accountNumber} ·{' '}
          {app.bankAccount.holderName}
        </p>
      )}
      <p className={`${styles.line} ${styles.muted} ${styles.small}`}>
        {t('teacher.agreementAccepted', { version: app.agreementVersion, date: formatDate(app.agreementAcceptedAt) })}
      </p>
      {app.reviewNote && (
        <p className={`${styles.line} ${styles.pre}`}>
          <strong>{t('teacher.reason')}:</strong> {app.reviewNote}
        </p>
      )}
      {app.status === 'SUBMITTED' && (
        <div className={styles.rowActions}>
          <Button onClick={() => void act('approve')}>{t('teacher.approve')}</Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            {t('teacher.reject')}
          </Button>
        </div>
      )}
      {app.status === 'APPROVED' && <PayoutHoldForm teacherId={app.user.id} />}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ReasonDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={t('teacher.reject')}
        label={t('teacher.rejectReason')}
        confirmLabel={t('teacher.reject')}
        danger
        onSubmit={(reason) => act('reject', reason)}
      />
    </section>
  );
}

/** Нээлттэй payout хүсэлтгүй багшийг ч hold хийх боломж (ticket 20). Цуцлах — `/admin/payouts`. */
function PayoutHoldForm({ teacherId }: { teacherId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hold(reason: string) {
    setError(null);
    try {
      await api(`/admin/payouts/holds/${teacherId}`, { method: 'PUT', body: { reason } });
      setDone(true);
      toast.toast(t('payout.held'));
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (done) return <p className={styles.line}>{t('payout.held')}</p>;
  return (
    <div className={styles.rowActions}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t('payout.hold')}
      </Button>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('payout.hold')}
        label={t('payout.holdReason')}
        confirmLabel={t('payout.hold')}
        onSubmit={hold}
      />
    </div>
  );
}
