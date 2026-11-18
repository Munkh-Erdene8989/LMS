import type { CatalogCourseCard, CourseRating } from '@lms/shared';
import { formatPrice, formatRating } from '@/lib/format';
import { t } from '@/lib/i18n';
import { CourseCard, levelLabel } from '../course-card';
import styles from './courses.module.css';

/** Каталогийн UI (server component-ууд) — `/courses`, багшийн profile. */

export { CourseCard, levelLabel };

export function Credits({ count }: { count: number }) {
  return <>{formatPrice(count)}</>;
}

export function Rating({ rating }: { rating: CourseRating }) {
  if (rating.average === null) return <span className="muted">{t('catalog.noRating')}</span>;
  return <span>{t('catalog.ratingValue', { rating: formatRating(rating.average), count: rating.count })}</span>;
}

export function CourseGrid({ courses }: { courses: CatalogCourseCard[] }) {
  return (
    <ul className={styles.grid}>
      {courses.map((c) => (
        <li key={c.id}>
          <CourseCard course={c} />
        </li>
      ))}
    </ul>
  );
}
