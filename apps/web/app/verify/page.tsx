import { t } from '@/lib/i18n';
import { VerifyForm } from './verify-form';

/** Нийтийн сертификат шалгах хуудас (нэвтрэлтгүй). */
export default function VerifyIndexPage() {
  return (
    <main className="page" style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
      <h1 style={{ margin: 0 }}>{t('certificate.verifyTitle')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('certificate.verifyIntro')}
      </p>
      <VerifyForm />
    </main>
  );
}
