'use client';

import { use, useEffect, useState } from 'react';
import { formatCertificateCode, formatUbDateTime, type CertificateVerification } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { VerifyForm } from '../verify-form';

/**
 * Нийтийн verify хуудас (`/verify/<code>`, нэвтрэлтгүй) — сертификатын QR код энд заана. Ажил олгогч г.м
 * эзэмшигчийн нэр, курс, багш, огноог харж жинхэнэ эсэхийг шалгана.
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
    <main className="page" style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
      <h1 style={{ margin: 0 }}>{t('certificate.verifyTitle')}</h1>
      {result === null && <p>{t('me.loading')}</p>}
      {result === 'not-found' && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {t('certificate.verifyNotFound')}
        </p>
      )}
      {result && result !== 'not-found' && (
        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <strong className="done-mark">✓ {t('certificate.verifyValid')}</strong>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: 0 }}>
            <dt className="muted">{t('certificate.verifyRecipient')}</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{result.recipientName}</dd>
            <dt className="muted">{t('certificate.verifyCourse')}</dt>
            <dd style={{ margin: 0 }}>{result.courseTitle}</dd>
            <dt className="muted">{t('certificate.verifyTeacher')}</dt>
            <dd style={{ margin: 0 }}>{result.teacherName}</dd>
            <dt className="muted">{t('certificate.verifyDate')}</dt>
            <dd style={{ margin: 0 }}>{formatUbDateTime(result.issuedAt).slice(0, 10)}</dd>
            <dt className="muted">{t('certificate.verifyCode')}</dt>
            <dd style={{ margin: 0, fontFamily: 'monospace' }}>{formatCertificateCode(result.code)}</dd>
          </dl>
        </section>
      )}
      {result !== null && (
        <section style={{ display: 'grid', gap: 8 }}>
          <small className="muted">{t('certificate.verifyAnother')}</small>
          <VerifyForm />
        </section>
      )}
    </main>
  );
}
