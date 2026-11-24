import Image from 'next/image';
import Link from 'next/link';
import type { CatalogCourseCard } from '@lms/shared';
import { formatPrice, formatRating } from '@/lib/format';
import { t } from '@/lib/i18n';
import styles from './landing.module.css';

const COVER_SIZES = '(min-width: 960px) 340px, (min-width: 640px) 50vw, calc(100vw - 32px)';

/** Landing-ийн онцлох курсийн карт. coverUrl байхгүй бол fallback зураг. Hover: зөвхөн CSS (cover scale). */
export function FeaturedCourse({ course }: { course: CatalogCourseCard }) {
  const avg = course.rating.average;
  return (
    <Link href={`/courses/${course.id}`} className={styles.course}>
      <span className={styles.coverWrap}>
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- cover-ийн host тогтмол биш
          <img className={styles.cover} src={course.coverUrl} alt="" width={640} height={400} loading="lazy" />
        ) : (
          <Image
            className={styles.cover}
            src="/images/course-cover-fallback.webp"
            alt=""
            aria-hidden="true"
            fill
            sizes={COVER_SIZES}
          />
        )}
      </span>
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
