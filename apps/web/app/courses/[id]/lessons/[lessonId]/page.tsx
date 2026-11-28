import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BRAND, canOpenLesson, type LessonAccessReason, type PublicCourseDetail } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { fetchCourse, fetchLesson } from '@/lib/catalog';
import { LiveInfo } from '../../../../course-ui';
import { Markdown } from '../../../../markdown';
import { LinkButton } from '../../../../ui/button';
import { PlayIcon } from '../../../../learning/icons';
import { LockedLesson, PurchaseProvider } from '../../../purchase-ui';
import { VideoPlayer } from '../../../../video-player';
import { LessonFrame, type FrameSection } from './lesson-frame';
import { LessonAttachments } from './lesson-attachments';
import { LessonLearning } from './lesson-learning';
import styles from './lesson.module.css';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; lessonId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lesson = await fetchLesson((await params).lessonId).catch(() => null);
  if (!lesson || lesson === 'locked') return { title: BRAND.name, robots: { index: false } };
  return {
    title: `${lesson.lesson.title} · ${lesson.course.title} — ${BRAND.name}`,
    robots: { index: lesson.access === 'PREVIEW' },
  };
}

const ACCESS_BADGE: Record<LessonAccessReason, MessageKey> = {
  PREVIEW: 'catalog.previewBadge',
  OWNED: 'purchase.ownedBadge',
  ORG: 'purchase.orgBadge',
  TEACHER: 'purchase.teacherBadge',
  ADMIN: 'purchase.adminBadge',
};

/** Хичээлийн жагсаалтын (sidebar) өгөгдөл: viewer-ийн эрхээр нээлттэй эсэхийг тодорхойлно. */
function frameSections(course: PublicCourseDetail, currentOpen: string | null): FrameSection[] {
  const v = course.viewer;
  return course.sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      priceCredits: l.priceCredits,
      isFreePreview: l.isFreePreview,
      open: l.id === currentOpen || canOpenLesson(v, l.id),
    })),
  }));
}

/**
 * Хичээл үзэх. Контентыг API зөвхөн эрхтэй үед өгнө (`LessonAccessPolicy`: preview, эзэмшил, багш, админ);
 * эрхгүй бол (403) хичээлийн нэр, үнэ + худалдаж авах товч. Худалдан авсны дараа хуудас шинэчлэгдэж контент гарна.
 * main-ийг app shell өгдөг — энд `<div>`.
 */
export default async function LessonPage({ params }: { params: Params }) {
  const { id, lessonId } = await params;
  const data = await fetchLesson(lessonId);
  if (!data || (data !== 'locked' && data.course.id !== id)) notFound();
  const course = await fetchCourse(id);

  if (data === 'locked') {
    const item = course?.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
    if (!course || !item) notFound();
    return (
      <LessonFrame courseId={id} courseTitle={course.title} sections={frameSections(course, null)} currentId={lessonId}>
        <PurchaseProvider initial={course}>
          <LockedLesson lesson={item} />
        </PurchaseProvider>
      </LessonFrame>
    );
  }

  const flat = course?.sections.flatMap((s) => s.lessons) ?? [];
  const next = flat[flat.findIndex((l) => l.id === lessonId) + 1];
  const { content } = data;

  return (
    <LessonFrame
      courseId={id}
      courseTitle={data.course.title}
      sections={course ? frameSections(course, lessonId) : []}
      currentId={lessonId}
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="pill">{t(ACCESS_BADGE[data.access])}</span>
          <h1 className={styles.title}>{data.lesson.title}</h1>
          <p className={styles.sub}>{t(`course.type${data.lesson.type}` as MessageKey)}</p>
        </div>
        {next && (
          <LinkButton className={styles.next} href={`/courses/${id}/lessons/${next.id}`}>
            {t('learningUi.nextLesson')}
          </LinkButton>
        )}
      </div>

      {content.type === 'VIDEO' &&
        (content.status === 'READY' ? (
          <div className={styles.main}>
            <VideoPlayer lessonId={data.lesson.id} />
            {data.access !== 'PREVIEW' && <p className={styles.hint}>{t('video.watermarkHint')}</p>}
          </div>
        ) : (
          <div className={`${styles.frame} ${styles.placeholder}`}>
            <span className={styles.placeholderIcon}>
              <PlayIcon />
            </span>
            <p>{content.fromLive ? t('live.recordingPending') : t('video.pending')}</p>
          </div>
        ))}
      {content.type === 'TEXT' && (
        <div className={styles.panel}>
          <Markdown source={content.markdown} />
        </div>
      )}
      {content.type === 'ASSIGNMENT' && (
        <div className={styles.panel}>
          <Markdown source={content.instructions} />
        </div>
      )}
      {content.type === 'LIVE' && (
        <section className={styles.panel}>
          <LiveInfo content={content} linkHidden={data.access === 'PREVIEW' ? 'owners-only' : undefined} />
        </section>
      )}
      {content.type === 'PDF' && content.url && (
        <div className={styles.pdf}>
          <iframe className={styles.pdfFrame} src={content.url} title={content.fileName ?? data.lesson.title} />
          <div>
            <a className="btn btn-secondary" href={content.url} target="_blank" rel="noreferrer">
              {t('catalog.openPdf')}
              {content.fileName ? `: ${content.fileName}` : ''}
            </a>
          </div>
          <p className={styles.hint}>{t('catalog.pdfExpires')}</p>
        </div>
      )}

      <LessonAttachments lessonId={data.lesson.id} attachments={data.attachments} />

      <LessonLearning
        lessonId={data.lesson.id}
        type={data.lesson.type}
        quiz={content.type === 'QUIZ' ? content : null}
        loginHref={`/login?next=${encodeURIComponent(`/courses/${id}/lessons/${lessonId}`)}`}
      />
    </LessonFrame>
  );
}
