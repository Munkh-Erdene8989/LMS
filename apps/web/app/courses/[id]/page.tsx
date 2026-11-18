import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import { fetchCourse, fetchCourseReviews } from '@/lib/catalog';
import { Markdown } from '../../markdown';
import { Rating, levelLabel } from '../catalog-ui';
import { CourseMobileBar, CoursePriceBox, CourseReferralCopy, LessonRow, PurchaseProvider } from '../purchase-ui';
import styles from '../courses.module.css';
import { CourseReviews } from './reviews-ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

function plain(markdown: string, max = 160): string {
  const s = markdown.replace(/[#*`>[\]()_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await fetchCourse((await params).id).catch(() => null);
  if (!course) return { title: BRAND.name };
  const title = `${course.title} — ${BRAND.name}`;
  const description = plain(course.description) || t('catalog.metaDescription');
  const images = course.coverUrl ? [{ url: course.coverUrl, alt: course.title }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/courses/${course.id}` },
    openGraph: { title: course.title, description, type: 'website', images },
    twitter: { card: images ? 'summary_large_image' : 'summary', title: course.title, description, images: images?.map((i) => i.url) },
  };
}

/**
 * Курсийн нийтийн хуудас: агуулга (зөвхөн нийтлэгдсэн хичээлүүд), үнэ, багш. Нэвтрэлт заавал биш;
 * нэвтэрсэн бол хувийн үнэ (өмнө төлсөн хасагдсан), эзэмшсэн хичээл нээлттэй, худалдан авах товч; үнэлгээ (ticket 18).
 */
export default async function CoursePage({ params }: { params: Params }) {
  const id = (await params).id;
  const [course, reviews] = await Promise.all([fetchCourse(id), fetchCourseReviews(id)]);
  if (!course) notFound();

  return (
    <div className={`page wide ${styles.pageWithBar}`}>
      <nav aria-label={t('courses.breadcrumb')}>
        <ol className={styles.crumbs}>
          <li>
            <Link href="/courses">{t('catalog.title')}</Link>
          </li>
          {course.category?.parent && (
            <li>
              <Link href={`/courses?category=${course.category.parent.slug}`}>{course.category.parent.name}</Link>
            </li>
          )}
          {course.category && (
            <li>
              <Link href={`/courses?category=${course.category.slug}`}>{course.category.name}</Link>
            </li>
          )}
        </ol>
      </nav>

      <PurchaseProvider initial={course}>
        <div className={styles.layout}>
          <div className={styles.main}>
            <header className={styles.hero}>
              <h1 className={styles.heroTitle}>{course.title}</h1>
              <p className={styles.meta}>
                <span>{levelLabel(course.level)}</span>
                <span>{t('catalog.lessons', { count: course.lessonCount })}</span>
                <a href="#reviews">
                  <Rating rating={course.rating} />
                </a>
                <Link className={styles.teacherInline} href={`/teachers/${course.teacher.id}`}>
                  {course.teacher.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatar host тогтмол биш
                    <img className={styles.avatarSm} src={course.teacher.avatarUrl} alt="" width={24} height={24} />
                  ) : (
                    <span className={styles.avatarSm} aria-hidden="true" />
                  )}
                  {course.teacher.name}
                </Link>
              </p>
              {course.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- cover host тогтмол биш; aspect-ratio-оор CLS-гүй
                <img className={styles.cover} src={course.coverUrl} alt="" width={1280} height={720} decoding="async" />
              )}
            </header>

            <CourseReferralCopy />

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('catalog.about')}</h2>
              <Markdown source={course.description} />
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('catalog.curriculum')}</h2>
              <div className={styles.curriculum}>
                {course.sections.map((s) => (
                  <div key={s.id} className={`card ${styles.lessonGroup}`}>
                    <h3 className={styles.lessonGroupTitle}>{s.title}</h3>
                    <ul className={styles.lessons} aria-label={t('courses.lessonList')}>
                      {s.lessons.map((l) => (
                        <LessonRow key={l.id} lesson={l} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('catalog.teacher')}</h2>
              <div className={`card ${styles.teacherCard}`}>
                {course.teacher.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar host тогтмол биш
                  <img className={styles.avatar} src={course.teacher.avatarUrl} alt="" width={56} height={56} loading="lazy" />
                ) : (
                  <span className={styles.avatar} aria-hidden="true" />
                )}
                <div className={styles.teacherBody}>
                  <Link className={styles.teacherName} href={`/teachers/${course.teacher.id}`}>
                    {course.teacher.name}
                  </Link>
                  {course.teacher.bio && <p className={styles.bio}>{course.teacher.bio}</p>}
                  <div className={styles.teacherLinks}>
                    <Link href={`/teachers/${course.teacher.id}`}>{t('courses.viewProfile')}</Link>
                    <Link href={`/communities/${course.teacher.id}`}>{t('community.open')}</Link>
                  </div>
                </div>
              </div>
            </section>

            <CourseReviews courseId={course.id} initial={reviews} />
          </div>

          <CoursePriceBox />
        </div>
        <CourseMobileBar />
      </PurchaseProvider>
    </div>
  );
}
