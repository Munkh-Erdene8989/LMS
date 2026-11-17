'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { formatCertificateCode, formatUbDateTime, type CertificateStatus, type CertificateView } from '@lms/shared';
import { api, apiDownload, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';

/**
 * Курсийн сертификат: олгогдсон бол PDF татах + нийтийн verify линк, үгүй бол нөхцөлийн явц. Нөхцөл
 * хангагдсан ч автоматаар олгогдоогүй (жишээ нь дараа нь курсийг бүтнээр авсан) бол "Сертификат авах".
 */
export function CertificateCard({ courseId }: { courseId: string }) {
  const [status, setStatus] = useState<CertificateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CertificateStatus>(`/learning/courses/${courseId}/certificate`)
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null));
  }, [courseId]);

  if (!status) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const claim = () =>
    run(async () => {
      const r = await api<CertificateView>(`/learning/courses/${courseId}/certificate`, { method: 'POST' });
      setStatus({ ...status, certificate: r.data });
    });

  const c = status.certificate;
  if (c) {
    return (
      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <strong>{t('certificate.issued')}</strong>
        <small>{t('certificate.issuedAt', { date: formatUbDateTime(c.issuedAt).slice(0, 10) })}</small>
        {c.quizAveragePercent !== null && <small>{t('certificate.quizAverage', { percent: c.quizAveragePercent })}</small>}
        <small className="muted">{t('certificate.code', { code: formatCertificateCode(c.code) })}</small>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => run(() => apiDownload(`/learning/certificates/${c.code}/pdf`, `certificate-${c.code}.pdf`))}
          >
            {busy ? t('certificate.downloading') : t('certificate.download')}
          </button>
          <Link className="btn btn-ghost" href={`/verify/${c.code}`}>
            {t('certificate.publicPage')}
          </Link>
        </div>
        {error && (
          <small role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </small>
        )}
      </section>
    );
  }

  const e = status.eligibility;
  if (e.lessonCount === 0) {
    return (
      <section className="card">
        <strong>{t('certificate.title')}</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {t('certificate.noLessons')}
        </p>
      </section>
    );
  }

  const quizOk = e.quizAveragePercent === null ? e.quizCount === 0 : e.quizAveragePercent >= e.minQuizAveragePercent;
  const rows: { ok: boolean; label: string; action?: ReactNode }[] = [
    { ok: e.ownsCourse, label: t('certificate.reqOwnsCourse'), action: !e.ownsCourse && <Link href={`/courses/${courseId}`}>{t('learning.openCourse')}</Link> },
    { ok: e.completedLessonCount === e.lessonCount, label: t('certificate.reqLessons', { completed: e.completedLessonCount, total: e.lessonCount }) },
    ...(e.quizCount > 0
      ? [
          {
            ok: quizOk,
            label:
              e.quizAveragePercent === null
                ? t('certificate.reqQuizNone', { min: e.minQuizAveragePercent })
                : t('certificate.reqQuiz', { min: e.minQuizAveragePercent, percent: e.quizAveragePercent }),
          },
        ]
      : []),
    { ok: !e.nameMissing, label: t('certificate.reqName'), action: e.nameMissing && <Link href="/me">{t('certificate.setName')}</Link> },
  ];

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <strong>{t('certificate.title')}</strong>
      <small className="muted">{t('certificate.requirementsIntro')}</small>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {rows.map((r) => (
          <li key={r.label}>
            <span className={r.ok ? 'done-mark' : 'muted'}>{r.ok ? '✓' : '○'}</span> {r.label} {r.action}
          </li>
        ))}
      </ul>
      {e.eligible && (
        <div>
          <button type="button" className="btn" disabled={busy} onClick={claim}>
            {busy ? t('certificate.claiming') : t('certificate.claim')}
          </button>
        </div>
      )}
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
    </section>
  );
}
