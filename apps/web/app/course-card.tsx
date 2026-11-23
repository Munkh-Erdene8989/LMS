import Link from 'next/link';
import type { CatalogCourseCard } from '@lms/shared';
import { formatNumber, formatPrice, formatRating } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import styles from './course-card.module.css';

/** Cover-гүй курсийн gradient: id-ээс тодорхойлогдох (8 хувилбарын нэг). */
const GRADIENTS = [styles.g0, styles.g1, styles.g2, styles.g3, styles.g4, styles.g5, styles.g6, styles.g7];

function gradientFor(id: string): string | undefined {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

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
      {course.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- cover-ийн host тогтмол биш; width/height + aspect-ratio-оор CLS-гүй
        <img className={styles.cover} src={course.coverUrl} alt="" width={640} height={400} loading="lazy" decoding="async" />
      ) : (
        <div className={`${styles.cover} ${styles.fallback} ${gradientFor(course.id) ?? ''}`} aria-hidden="true" />
      )}
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
