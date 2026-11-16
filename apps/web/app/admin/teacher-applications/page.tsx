'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminTeacherApplicationView, TeacherApplicationStatus } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

const STATUSES: TeacherApplicationStatus[] = ['SUBMITTED', 'REJECTED', 'APPROVED'];

export default function AdminTeacherApplicationsPage() {
  const [status, setStatus] = useState<TeacherApplicationStatus>('SUBMITTED');
  const [items, setItems] = useState<AdminTeacherApplicationView[] | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    setItems((await api<AdminTeacherApplicationView[]>(`/admin/teacher-applications?status=${status}`)).data);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('teacher.adminTitle')}</h1>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={s === status} className={s === status ? 'btn' : 'btn btn-ghost'} onClick={() => setStatus(s)}>
            {t(`teacher.tab${s}` as MessageKey)}
          </button>
        ))}
      </div>
      {!items && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('teacher.adminEmpty')}</p>}
      {items?.map((a) => <ApplicationCard key={a.id} app={a} onDone={load} />)}
    </main>
  );
}

function ApplicationCard({ app, onDone }: { app: AdminTeacherApplicationView; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function act(path: 'approve' | 'reject') {
    setError(null);
    try {
      await api(`/admin/teacher-applications/${app.id}/${path}`, {
        method: 'POST',
        body: path === 'reject' ? { reason } : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    }
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{app.displayName}</strong>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>{t('teacher.submittedAt', { date: formatDate(app.submittedAt) })}</span>
      </div>
      <p style={{ margin: 0 }}>
        <strong>{t('teacher.contact')}:</strong> {[app.user.phone, app.user.email].filter(Boolean).join(' · ')}
      </p>
      <p style={{ margin: 0 }}>
        <strong>{t('teacher.expertise')}:</strong> {app.expertise}
      </p>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{app.bio}</p>
      <p style={{ margin: 0 }}>
        <a href={app.sampleUrl} target="_blank" rel="noreferrer noopener">
          {app.sampleUrl}
        </a>
      </p>
      {app.bankAccount && (
        <p style={{ margin: 0 }}>
          <strong>{t('teacher.bank')}:</strong> {t(`banks.${app.bankAccount.bank}` as MessageKey)} · {app.bankAccount.accountNumber} ·{' '}
          {app.bankAccount.holderName}
        </p>
      )}
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
        {t('teacher.agreementAccepted', { version: app.agreementVersion, date: formatDate(app.agreementAcceptedAt) })}
      </p>
      {app.reviewNote && (
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          <strong>{t('teacher.reason')}:</strong> {app.reviewNote}
        </p>
      )}
      {app.status === 'SUBMITTED' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea
            className="input"
            rows={2}
            placeholder={t('teacher.rejectReason')}
            aria-label={t('teacher.rejectReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => act('approve')}>
              {t('teacher.approve')}
            </button>
            <button className="btn btn-ghost" disabled={!reason.trim()} onClick={() => act('reject')}>
              {t('teacher.reject')}
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
    </section>
  );
}
