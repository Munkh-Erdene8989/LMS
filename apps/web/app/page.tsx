import { BRAND } from '@lms/shared';
import { fetchHealth } from '@/lib/api';
import Link from 'next/link';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await fetchHealth();

  const apiOk = health !== null;
  const dbOk = health?.db === 'ok';

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ margin: 0 }}>{t('home.title', { brand: BRAND.name })}</h1>
      <p style={{ color: 'var(--muted)' }}>{t('home.subtitle')}</p>
      <p style={{ display: 'flex', gap: 8 }}>
        <Link className="btn" href="/courses">{t('catalog.browseCta')}</Link>
        <Link className="btn" href="/login">{t('home.login')}</Link>
        <Link className="btn btn-ghost" href="/me">{t('home.profile')}</Link>
      </p>

      <section style={{ marginTop: 32, border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{t('home.systemStatus')}</h2>
        <StatusRow label={t('home.api')} ok={apiOk} text={apiOk ? t('home.ok') : t('home.unreachable')} />
        <StatusRow
          label={t('home.db')}
          ok={dbOk}
          text={!apiOk ? '—' : dbOk ? t('home.ok') : t('home.error')}
        />
      </section>
    </main>
  );
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <p style={{ margin: '4px 0' }} data-testid={`status-${label}`}>
      {label}: <strong style={{ color: ok ? 'var(--ok)' : 'var(--err)' }}>{text}</strong>
    </p>
  );
}
