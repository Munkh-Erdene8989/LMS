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
    <div className={styles.split}>
      <div className={styles.page}>
        <h1 className={styles.title}>{t('auth.title')}</h1>
        <p className={styles.subtitle}>{t('auth.subtitle')}</p>
        <section className={`card ${styles.card}`}>
          <OtpFlow basePath="/auth/otp" types={['PHONE', 'EMAIL']} onVerified={onVerified} />
        </section>
      </div>
      <aside className={styles.aside} aria-label={t('auth.perksLabel')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- bundle budget: next/image /login-д +1 kB */}
        <img className={styles.asideImg} src="/images/hero-learning.webp" alt="" aria-hidden="true" width={1600} height={893} loading="lazy" decoding="async" />
        <ul className={styles.perks}>
          {(['auth.perk1', 'auth.perk2', 'auth.perk3'] as const).map((k) => (
            <li key={k}>
              <span className={styles.check} aria-hidden="true">✓</span>
              {t(k)}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
