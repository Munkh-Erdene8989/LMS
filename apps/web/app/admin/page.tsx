import { fetchHealth } from '@/lib/api';
import { t } from '@/lib/i18n';
import { pageMeta } from '@/lib/page-meta';
import { AdminOverview } from './overview';
import styles from './admin.module.css';
import ds from '../ui/dashboard.module.css';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta('adminUi.overviewTitle');

/** Тойм: KPI (7/30/90 хоног), хүлээгдэж буй ажил, системийн төлөв. Тохиргоо → `/admin/settings`. */
export default async function AdminOverviewPage() {
  const health = await fetchHealth();
  const apiOk = health !== null;
  const dbOk = health?.db === 'ok';
  const ok = apiOk && dbOk;
  const detail = `${t('home.api')}: ${apiOk ? t('home.ok') : t('home.unreachable')} · ${t('home.db')}: ${
    !apiOk ? '—' : dbOk ? t('home.ok') : t('home.error')
  }`;

  return (
    <div className={styles.stackLg}>
      <header className={ds.pageHead}>
        <h1 className={styles.title}>{t('adminUi.overviewTitle')}</h1>
        <p className={ds.health} title={detail} data-testid="system-status">
          <span className={`${ds.dot} ${ok ? '' : ds.dotErr}`} aria-hidden="true" />
          {ok ? t('adminUi.systemOk') : t('adminUi.systemDegraded')}
          <span className={ds.visuallyHidden}> — {detail}</span>
        </p>
      </header>
      <AdminOverview />
    </div>
  );
}
