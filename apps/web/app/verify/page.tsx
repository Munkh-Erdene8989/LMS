import { t } from '@/lib/i18n';
import { VerifyForm } from './verify-form';
import styles from './verify.module.css';

/** Нийтийн сертификат шалгах хуудас (нэвтрэлтгүй). main-ийг layout өгнө. */
export default function VerifyIndexPage() {
  return (
    <div className={`page-narrow ${styles.page}`}>
      <h1 className={styles.title}>{t('certificate.verifyTitle')}</h1>
      <p className="muted">{t('certificate.verifyIntro')}</p>
      <VerifyForm />
    </div>
  );
}
