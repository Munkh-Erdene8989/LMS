'use client';

import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { safeNext } from '@/lib/next-path';
import { OtpFlow } from '../otp-flow';

export default function LoginPage() {
  const router = useRouter();
  // `?next=/courses/…` — худалдан авах гэж байгаад нэвтрэх шаардлагатай болсон бол тэр хуудас руу буцна.
  const onVerified = () => router.push(safeNext(new URLSearchParams(window.location.search).get('next')) ?? '/me');
  return (
    <main className="page narrow">
      <h1 style={{ marginTop: 0 }}>{t('auth.title')}</h1>
      <p style={{ color: 'var(--muted)' }}>{t('auth.subtitle')}</p>
      <section className="card">
        <OtpFlow basePath="/auth/otp" types={['PHONE', 'EMAIL']} onVerified={onVerified} />
      </section>
    </main>
  );
}
