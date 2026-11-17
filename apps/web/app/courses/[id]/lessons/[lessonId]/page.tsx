import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRAND, type LessonAccessReason } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { fetchCourse, fetchLesson } from '@/lib/catalog';
import { LiveInfo } from '../../../../course-ui';
import { Markdown } from '../../../../markdown';
import { LockedLesson, PurchaseProvider } from '../../../purchase-ui';
import { LessonLearning } from './lesson-learning';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; lessonId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lesson = await fetchLesson((await params).lessonId).catch(() => null);
  if (!lesson || lesson === 'locked') return { title: BRAND.name, robots: { index: false } };
  return { title: `${lesson.lesson.title} · ${lesson.course.title} — ${BRAND.name}`, robots: { index: lesson.access === 'PREVIEW' } };
}

const ACCESS_BADGE: Record<LessonAccessReason, MessageKey> = {
  PREVIEW: 'catalog.previewBadge',
  OWNED: 'purchase.ownedBadge',
  TEACHER: 'purchase.teacherBadge',
  ADMIN: 'purchase.adminBadge',
};

/**
 * Хичээл үзэх. Контентыг API зөвхөн эрхтэй үед өгнө (`LessonAccessPolicy`: preview, эзэмшил, багш, админ);
 * эрхгүй бол (403) хичээлийн нэр, үнэ + худалдаж авах товч. Худалдан авсны дараа хуудас шинэчлэгдэж контент гарна.
 */
export default async function LessonPage({ params }: { params: Params }) {
  const { id, lessonId } = await params;
  const data = await fetchLesson(lessonId);
  if (!data || (data !== 'locked' && data.course.id !== id)) notFound();

  if (data === 'locked') {
    const course = await fetchCourse(id);
    const item = course?.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
    if (!course || !item) notFound();
    return (
      <main className="page" style={{ display: 'grid', gap: 16 }}>
        <Link href={`/courses/${id}`}>{t('catalog.backToCourse')}</Link>
        <PurchaseProvider initial={course}>
          <LockedLesson lesson={item} />
        </PurchaseProvider>
      </main>
    );
  }

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <Link href={`/courses/${id}`}>{t('catalog.backToCourse')}</Link>
      <div>
        <span className="pill">{t(ACCESS_BADGE[data.access])}</span>
        <h1 style={{ margin: '8px 0 0' }}>{data.lesson.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {data.course.title}
        </p>
      </div>
      {data.content.type === 'TEXT' && <Markdown source={data.content.markdown} />}
      {data.content.type === 'LIVE' && (
        <section className="card">
          <LiveInfo content={data.content} linkHidden={data.access === 'PREVIEW' ? 'owners-only' : undefined} />
        </section>
      )}
      {data.content.type === 'VIDEO' && <p className="muted">{t('live.recordingPending')}</p>}
      {data.content.type === 'PDF' && data.content.url && (
        <div style={{ display: 'grid', gap: 8 }}>
          <iframe className="pdf-frame" src={data.content.url} title={data.content.fileName ?? data.lesson.title} />
          <a className="btn btn-ghost" href={data.content.url} target="_blank" rel="noreferrer">
            {t('catalog.openPdf')}
            {data.content.fileName ? `: ${data.content.fileName}` : ''}
          </a>
          <small className="muted">{t('catalog.pdfExpires')}</small>
        </div>
      )}
      <LessonLearning
        lessonId={data.lesson.id}
        type={data.lesson.type}
        quiz={data.content.type === 'QUIZ' ? data.content : null}
        loginHref={`/login?next=${encodeURIComponent(`/courses/${id}/lessons/${lessonId}`)}`}
      />
    </main>
  );
}
