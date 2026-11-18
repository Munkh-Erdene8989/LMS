import { Skeleton } from '../ui/skeleton';
import { t } from '@/lib/i18n';
import styles from './courses.module.css';

export default function CoursesLoading() {
  return (
    <div className="page wide" aria-busy="true" aria-label={t('courses.loading')}>
      <div className={styles.head}>
        <Skeleton width="40%" height="2.5rem" />
        <Skeleton width="min(100%, 640px)" height="48px" radius="999px" />
      </div>
      <ul className={styles.grid}>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className={styles.skeletonCard}>
            <Skeleton height="auto" radius="22px" className={styles.skeletonCover} />
            <span className={styles.skeletonLines}>
              <Skeleton height="1.1em" />
              <Skeleton height="1.1em" width="70%" />
              <Skeleton height="0.9em" width="45%" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
