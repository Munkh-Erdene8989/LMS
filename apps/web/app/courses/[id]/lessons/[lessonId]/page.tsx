import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import { fetchLesson } from '@/lib/catalog';
import { Markdown } from '../../../../markdown';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; lessonId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lesson = await fetchLesson((await params).lessonId).catch(() => null);
  if (!lesson || lesson === 'locked') return { title: BRAND.name, robots: { index: false } };
  return { title: `${lesson.lesson.title} · ${lesson.course.title} — ${BRAND.name}` };
}

/**
 * Үнэгүй (free preview) хичээл үзэх — нэвтрэлтгүй. Төлбөртэй хичээлийн контентыг API огт өгөхгүй (403);
 * худалдан авалт (ticket 09) нэмэгдэхэд энэ хуудас эрхтэй хэрэглэгчид ч ажиллана.
 */
export default async function LessonPreviewPage({ params }: { params: Params }) {
  const { id, lessonId } = await params;
  const data = await fetchLesson(lessonId);
  if (!data || (data !== 'locked' && data.course.id !== id)) notFound();

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <Link href={`/courses/${id}`}>{t('catalog.backToCourse')}</Link>
      {data === 'locked' ? (
        <p className="muted">{t('catalog.locked')}</p>
      ) : (
        <>
          <div>
            <span className="pill">{t('catalog.previewBadge')}</span>
            <h1 style={{ margin: '8px 0 0' }}>{data.lesson.title}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {data.course.title}
            </p>
          </div>
          {data.content.type === 'TEXT' && <Markdown source={data.content.markdown} />}
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
        </>
      )}
    </main>
  );
}
