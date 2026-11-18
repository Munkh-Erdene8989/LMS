import { t } from '@/lib/i18n';
import { Skeleton, SkeletonText } from './skeleton';
import styles from './page-loading.module.css';

export interface PageLoadingProps {
  /** `page` (1120px), `wide`, `narrow` — globals.css-ийн контейнер класс. */
  container?: 'page' | 'wide' | 'page-narrow' | 'none';
  /** Гарчгийн доорх карт блокийн тоо (0 = зөвхөн текст). */
  cards?: number;
}

/** Route-ийн `loading.tsx`-д зориулсан хөнгөн skeleton: гарчиг + текст + карт. Дэлгэц уншигчид зөвхөн нэг текст. */
export function PageLoading({ container = 'page', cards = 3 }: PageLoadingProps) {
  return (
    <div className={container === 'none' ? styles.root : `${container} ${styles.root}`} aria-busy="true">
      <span className={styles.srOnly} role="status">
        {t('ui.loading')}
      </span>
      <Skeleton width="min(60%, 320px)" height="2rem" />
      <SkeletonText lines={2} />
      {cards > 0 && (
        <div className={styles.grid}>
          {Array.from({ length: cards }, (_, i) => (
            <Skeleton key={i} height="7.5rem" radius="16px" />
          ))}
        </div>
      )}
    </div>
  );
}
