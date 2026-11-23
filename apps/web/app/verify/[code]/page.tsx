'use client';

import { use, useEffect, useState } from 'react';
import { formatCertificateCode, formatUbDateTime, type CertificateVerification } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { Skeleton } from '../../ui/skeleton';
import { VerifyForm } from '../verify-form';
import styles from '../verify.module.css';

/**
 * Нийтийн verify хуудас (`/verify/<code>`, нэвтрэлтгүй) — сертификатын QR код энд заана. Ажил олгогч г.м
 * эзэмшигчийн нэр, курс, багш, огноог харж жинхэнэ эсэхийг шалгана. Layout өөрөө main-ийг өгнө.
 */
export default function VerifyCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [result, setResult] = useState<CertificateVerification | null | 'not-found'>(null);

  useEffect(() => {
    api<CertificateVerification>(`/certificates/verify/${encodeURIComponent(code)}`)
      .then((r) => setResult(r.data))
      .catch(() => setResult('not-found'));
  }, [code]);

  return (
    <div className={`page-narrow ${styles.page}`}>
      <h1 className={styles.title}>{t('certificate.verifyTitle')}</h1>
      {result === null && (
        <div className={styles.loading} aria-busy="true">
          <span className={styles.srOnly}>{t('me.loading')}</span>
          <Skeleton height="1.25rem" width="40%" />
          <Skeleton height="6rem" radius="16px" />
        </div>
      )}
      {result === 'not-found' && (
        <p role="alert" className={styles.error}>
          {t('certificate.verifyNotFound')}
        </p>
      )}
      {result && result !== 'not-found' && (
        <section className={`card ${styles.result}`}>
          <strong className="done-mark">✓ {t('certificate.verifyValid')}</strong>
          <dl className={styles.list}>
            <dt className="muted">{t('certificate.verifyRecipient')}</dt>
            <dd className={styles.strong}>{result.recipientName}</dd>
            <dt className="muted">{t('certificate.verifyCourse')}</dt>
            <dd>{result.courseTitle}</dd>
            <dt className="muted">{t('certificate.verifyTeacher')}</dt>
            <dd>{result.teacherName}</dd>
            <dt className="muted">{t('certificate.verifyDate')}</dt>
            <dd>{formatUbDateTime(result.issuedAt).slice(0, 10)}</dd>
            <dt className="muted">{t('certificate.verifyCode')}</dt>
            <dd className={styles.mono}>{formatCertificateCode(result.code)}</dd>
          </dl>
        </section>
      )}
      {result !== null && (
        <section className={styles.again}>
          <small className="muted">{t('certificate.verifyAnother')}</small>
          <VerifyForm />
        </section>
      )}
    </div>
  );
}
