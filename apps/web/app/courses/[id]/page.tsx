import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import { fetchCourse } from '@/lib/catalog';
import { Markdown } from '../../markdown';
import { Credits, levelLabel, Rating } from '../catalog-ui';
import { CoursePriceBox, LessonAction, PurchaseProvider } from '../purchase-ui';

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
 * нэвтэрсэн бол хувийн үнэ (өмнө төлсөн хасагдсан), эзэмшсэн хичээл нээлттэй, худалдан авах товч.
 */
export default async function CoursePage({ params }: { params: Params }) {
  const course = await fetchCourse((await params).id);
  if (!course) notFound();

  return (
    <main className="page wide course-page">
      <nav className="breadcrumb" aria-label={t('catalog.categories')}>
        <Link href="/courses">{t('catalog.title')}</Link>
        {course.category?.parent && (
          <>
            {' / '}
            <Link href={`/courses?category=${course.category.parent.slug}`}>{course.category.parent.name}</Link>
          </>
        )}
        {course.category && (
          <>
            {' / '}
            <Link href={`/courses?category=${course.category.slug}`}>{course.category.name}</Link>
          </>
        )}
      </nav>

      <div className="course-hero">
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h1 style={{ margin: 0 }}>{course.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {levelLabel(course.level)} · {t('catalog.lessons', { count: course.lessonCount })} · <Rating rating={course.rating} />
          </p>
          <p style={{ margin: 0 }}>
            {t('catalog.teacher')}: <Link href={`/teachers/${course.teacher.id}`}>{course.teacher.name}</Link>
          </p>
        </div>
        {course.coverUrl && <img className="course-cover" src={course.coverUrl} alt="" />}
      </div>

      <PurchaseProvider initial={course}>
        <div className="course-body">
          <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
            <section>
              <h2>{t('catalog.about')}</h2>
              <Markdown source={course.description} />
            </section>

            <section>
              <h2>{t('catalog.curriculum')}</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {course.sections.map((s) => (
                  <div key={s.id} className="card">
                    <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{s.title}</h3>
                    <ul className="lesson-list">
                      {s.lessons.map((l) => (
                        <li key={l.id} className="lesson-row">
                          <span>
                            {l.title} <small>· {t(`course.type${l.type}`)}</small>
                          </span>
                          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <small>
                              <Credits count={l.priceCredits} />
                            </small>
                            <LessonAction lesson={l} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2>{t('catalog.teacher')}</h2>
              <div className="teacher-box">
                {course.teacher.avatarUrl ? <img className="avatar" src={course.teacher.avatarUrl} alt="" /> : <div className="avatar" />}
                <div style={{ display: 'grid', gap: 4 }}>
                  <Link href={`/teachers/${course.teacher.id}`}>
                    <strong>{course.teacher.name}</strong>
                  </Link>
                  {course.teacher.bio && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{course.teacher.bio}</p>}
                </div>
              </div>
            </section>
          </div>

          <CoursePriceBox />
        </div>
      </PurchaseProvider>
    </main>
  );
}
