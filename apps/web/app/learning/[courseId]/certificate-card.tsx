'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { formatCertificateCode, formatUbDateTime, type CertificateStatus, type CertificateView } from '@lms/shared';
import { api, apiDownload, errorText } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { Button, LinkButton } from '../../ui/button';
import { useToast } from '../../ui/toast';
import { CheckIcon } from '../icons';
import styles from '../learning.module.css';

/**
 * Курсийн сертификат: олгогдсон бол PDF татах + нийтийн verify линк, үгүй бол нөхцөлийн явц. Нөхцөл
 * хангагдсан ч автоматаар олгогдоогүй (жишээ нь дараа нь курсийг бүтнээр авсан) бол "Сертификат авах".
 */
export function CertificateCard({ courseId }: { courseId: string }) {
  const { toast } = useToast();
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
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const claim = () =>
    run(async () => {
      const r = await api<CertificateView>(`/learning/courses/${courseId}/certificate`, { method: 'POST' });
      setStatus({ ...status, certificate: r.data });
      toast(t('learningUi.certificateClaimed'));
    });

  const c = status.certificate;
  if (c) {
    return (
      <section className={styles.panel} aria-labelledby="cert-title">
        <h2 id="cert-title" className={styles.panelTitle}>
          {t('certificate.issued')}
        </h2>
        <p className={styles.progressText}>
          {t('certificate.issuedAt', {
            date: formatUbDateTime(c.issuedAt).slice(0, 10),
          })}
        </p>
        {c.quizAveragePercent !== null && (
          <p className={styles.progressText}>{t('certificate.quizAverage', { percent: c.quizAveragePercent })}</p>
        )}
        <p className={styles.muted}>{t('certificate.code', { code: formatCertificateCode(c.code) })}</p>
        <div className={styles.certActions}>
          <Button
            loading={busy}
            loadingLabel={t('certificate.downloading')}
            onClick={() => run(() => apiDownload(`/learning/certificates/${c.code}/pdf`, `certificate-${c.code}.pdf`))}
          >
            {t('certificate.download')}
          </Button>
          <LinkButton variant="secondary" href={`/verify/${c.code}`}>
            {t('certificate.publicPage')}
          </LinkButton>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </section>
    );
  }

  const e = status.eligibility;
  if (e.lessonCount === 0) {
    return (
      <section className={styles.panel} aria-labelledby="cert-title">
        <h2 id="cert-title" className={styles.panelTitle}>
          {t('certificate.title')}
        </h2>
        <p className={styles.muted}>{t('certificate.noLessons')}</p>
      </section>
    );
  }

  const quizOk = e.quizAveragePercent === null ? e.quizCount === 0 : e.quizAveragePercent >= e.minQuizAveragePercent;
  const rows: { ok: boolean; label: string; action?: ReactNode }[] = [
    {
      ok: e.ownsCourse,
      label: t('certificate.reqOwnsCourse'),
      action: !e.ownsCourse && <Link href={`/courses/${courseId}`}>{t('learning.openCourse')}</Link>,
    },
    {
      ok: e.completedLessonCount === e.lessonCount,
      label: t('certificate.reqLessons', {
        completed: e.completedLessonCount,
        total: e.lessonCount,
      }),
    },
    ...(e.quizCount > 0
      ? [
          {
            ok: quizOk,
            label:
              e.quizAveragePercent === null
                ? t('certificate.reqQuizNone', { min: e.minQuizAveragePercent })
                : t('certificate.reqQuiz', {
                    min: e.minQuizAveragePercent,
                    percent: e.quizAveragePercent,
                  }),
          },
        ]
      : []),
    {
      ok: !e.nameMissing,
      label: t('certificate.reqName'),
      action: e.nameMissing && <Link href="/me">{t('certificate.setName')}</Link>,
    },
  ];

  return (
    <section className={styles.panel} aria-labelledby="cert-title">
      <h2 id="cert-title" className={styles.panelTitle}>
        {t('certificate.title')}
      </h2>
      <p className={styles.muted}>{t('certificate.requirementsIntro')}</p>
      <ul className={styles.reqs}>
        {rows.map((r) => (
          <li key={r.label} className={styles.req}>
            <span className={`${styles.reqMark} ${r.ok ? styles.reqOk : ''}`}>{r.ok ? <CheckIcon /> : null}</span>
            <span className={styles.srOnly}>{r.ok ? t('learningUi.reqMet') : t('learningUi.reqNotMet')}</span>
            <span>{r.label}</span>
            {r.action}
          </li>
        ))}
      </ul>
      {e.eligible && (
        <div>
          <Button loading={busy} loadingLabel={t('certificate.claiming')} onClick={claim}>
            {t('certificate.claim')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
