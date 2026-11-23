import { fetchHealth } from '@/lib/api';
import { t } from '@/lib/i18n';
import { pageMeta } from '@/lib/page-meta';
import { SettingsPanel } from './settings-panel';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta('admin.settingsTitle');

export default async function AdminSettingsPage() {
  const health = await fetchHealth();
  const apiOk = health !== null;
  const dbOk = health?.db === 'ok';

  return (
    <div className={styles.stackLg}>
      <h1 className={styles.title}>{t('admin.title')}</h1>

      <section className={styles.status} aria-labelledby="admin-status-title">
        <h2 id="admin-status-title" className={styles.subtitle}>
          {t('home.systemStatus')}
        </h2>
        <StatusRow label={t('home.api')} ok={apiOk} text={apiOk ? t('home.ok') : t('home.unreachable')} />
        <StatusRow label={t('home.db')} ok={dbOk} text={!apiOk ? '—' : dbOk ? t('home.ok') : t('home.error')} />
      </section>

      <SettingsPanel />
    </div>
  );
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <p className={styles.statusRow} data-testid={`status-${label}`}>
      <span className={`${styles.dot} ${ok ? '' : styles.dotErr}`} aria-hidden="true" />
      {label}: <strong>{text}</strong>
    </p>
  );
}
