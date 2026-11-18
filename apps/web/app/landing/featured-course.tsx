import Link from 'next/link';
import type { CatalogCourseCard } from '@lms/shared';
import { formatPrice, formatRating } from '@/lib/format';
import { t } from '@/lib/i18n';
import { hueFromId, type VarStyle } from './constants';
import styles from './landing.module.css';

/** Landing-ийн онцлох курсийн карт. coverUrl байхгүй бол id-аас gradient. */
export function FeaturedCourse({ course }: { course: CatalogCourseCard }) {
  const avg = course.rating.average;
  return (
    <Link href={`/courses/${course.id}`} className={styles.course}>
      {course.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cover} src={course.coverUrl} alt="" width={640} height={400} loading="lazy" />
      ) : (
        <span
          className={`${styles.cover} ${styles.coverGradient}`}
          style={{ '--h': hueFromId(course.id) } as VarStyle}
          aria-hidden="true"
        />
      )}
      <span className={styles.courseTitle}>{course.title}</span>
      <span className={styles.courseTeacher}>{course.teacher.name}</span>
      <span className={styles.courseFoot}>
        <span className={styles.courseMeta}>
          {t('landing.courseMeta', { count: course.lessonCount })}
          {avg !== null ? ` · ${t('landing.courseRating', { rating: formatRating(avg) })}` : ''}
        </span>
        <span className={styles.coursePrice}>{formatPrice(course.priceCredits)}</span>
      </span>
    </Link>
  );
}
