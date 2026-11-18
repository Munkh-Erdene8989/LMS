'use client';

import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { safeNext } from '@/lib/next-path';
import { OtpFlow } from '../otp-flow';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  // `?next=/courses/…` — худалдан авах гэж байгаад нэвтрэх шаардлагатай болсон бол тэр хуудас руу буцна.
  const onVerified = () => router.push(safeNext(new URLSearchParams(window.location.search).get('next')) ?? '/me');
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('auth.title')}</h1>
      <p className={styles.subtitle}>{t('auth.subtitle')}</p>
      <section className={`card ${styles.card}`}>
        <OtpFlow basePath="/auth/otp" types={['PHONE', 'EMAIL']} onVerified={onVerified} />
      </section>
    </main>
  );
}
