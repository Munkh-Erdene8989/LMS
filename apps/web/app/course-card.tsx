import Image from 'next/image';
import Link from 'next/link';
import type { CatalogCourseCard } from '@lms/shared';
import { formatNumber, formatPrice, formatRating } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import styles from './course-card.module.css';

export function levelLabel(level: string): string {
  return t(`course.level${level}` as MessageKey);
}

/**
 * Каталогийн карт (server-safe). Cover + гарчиг нь бүтэн картыг дарагдах болгоно (stretched link);
 * багшийн холбоос тусдаа. `owned` бол үнийн оронд «Авсан».
 */
export function CourseCard({ course, owned = false }: { course: CatalogCourseCard; owned?: boolean }) {
  const { teacher, rating } = course;
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- cover-ийн host тогтмол биш; width/height + aspect-ratio-оор CLS-гүй
          <img className={styles.cover} src={course.coverUrl} alt="" width={640} height={400} loading="lazy" decoding="async" />
        ) : (
          <Image
            className={styles.cover}
            src="/images/course-cover-fallback.webp"
            alt=""
            aria-hidden="true"
            fill
            sizes="(min-width: 960px) 360px, (min-width: 640px) 50vw, 100vw"
          />
        )}
      </div>
      <div className={styles.body}>
        {course.hasFreePreview && <span className={styles.preview}>{t('catalog.hasPreview')}</span>}
        <h3 className={styles.title}>
          <Link className={styles.titleLink} href={`/courses/${course.id}`}>
            {course.title}
          </Link>
        </h3>
        <Link className={styles.teacher} href={`/teachers/${teacher.id}`}>
          {teacher.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar host тогтмол биш
            <img className={styles.avatar} src={teacher.avatarUrl} alt="" width={22} height={22} loading="lazy" decoding="async" />
          ) : (
            <span className={styles.avatar} aria-hidden="true" />
          )}
          <span>{teacher.name}</span>
        </Link>
        <div className={styles.foot}>
          <span className={styles.meta}>
            {t('catalog.lessons', { count: course.lessonCount })}
            {' · '}
            {rating.average === null ? (
              t('catalog.noRating')
            ) : (
              <span title={t('courses.ratingCount', { count: formatNumber(rating.count) })}>{formatRating(rating.average)} ★</span>
            )}
          </span>
          {owned ? (
            <span className={`${styles.price} ${styles.owned}`}>{t('courses.owned')}</span>
          ) : (
            <span className={styles.price}>{formatPrice(course.priceCredits)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
