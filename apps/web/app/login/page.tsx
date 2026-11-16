'use client';

import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { OtpFlow } from '../otp-flow';

export default function LoginPage() {
  const router = useRouter();
  return (
    <main className="page narrow">
      <h1 style={{ marginTop: 0 }}>{t('auth.title')}</h1>
      <p style={{ color: 'var(--muted)' }}>{t('auth.subtitle')}</p>
      <section className="card">
        <OtpFlow basePath="/auth/otp" types={['PHONE', 'EMAIL']} onVerified={() => router.push('/me')} />
      </section>
    </main>
  );
}
