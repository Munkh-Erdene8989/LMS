import Link from 'next/link';
import type { CatalogCourseCard, CourseRating } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { formatNumber } from '@/lib/format';

/** Каталогийн UI (server component-ууд) — `/courses`, багшийн profile. */

export function Credits({ count }: { count: number }) {
  return <>{count === 0 ? t('catalog.free') : t('catalog.credits', { count: formatNumber(count) })}</>;
}

export function Rating({ rating }: { rating: CourseRating }) {
  if (rating.average === null) return <span className="muted">{t('catalog.noRating')}</span>;
  return <span>{t('catalog.ratingValue', { rating: rating.average.toFixed(1), count: rating.count })}</span>;
}

export function levelLabel(level: string): string {
  return t(`course.level${level}` as MessageKey);
}

export function CourseCard({ course }: { course: CatalogCourseCard }) {
  return (
    <Link href={`/courses/${course.id}`} className="catalog-card">
      {course.coverUrl ? <img src={course.coverUrl} alt="" loading="lazy" /> : <div className="cover-placeholder" />}
      <div className="catalog-card-body">
        <strong className="catalog-card-title">{course.title}</strong>
        <span className="muted">{course.teacher.name}</span>
        <span className="catalog-card-meta">
          {levelLabel(course.level)} · {t('catalog.lessons', { count: course.lessonCount })}
          {course.hasFreePreview && <span className="pill">{t('catalog.hasPreview')}</span>}
        </span>
        <span className="catalog-card-meta">
          <Rating rating={course.rating} />
          <strong>
            <Credits count={course.priceCredits} />
          </strong>
        </span>
      </div>
    </Link>
  );
}

export function CourseGrid({ courses }: { courses: CatalogCourseCard[] }) {
  return (
    <div className="catalog-grid">
      {courses.map((c) => (
        <CourseCard key={c.id} course={c} />
      ))}
    </div>
  );
}
