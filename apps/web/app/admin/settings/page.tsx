import { t } from '@/lib/i18n';
import { pageMeta } from '@/lib/page-meta';
import { SettingsPanel } from '../settings-panel';
import styles from '../admin.module.css';

export const metadata = pageMeta('admin.settingsTitle');

export default function AdminSettingsPage() {
  return (
    <div className={styles.stackLg}>
      <h1 className={styles.title}>{t('admin.navSettings')}</h1>
      <SettingsPanel />
    </div>
  );
}
