import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import { fetchTeacher } from '@/lib/catalog';
import { CourseGrid } from '../../courses/catalog-ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const teacher = await fetchTeacher((await params).id).catch(() => null);
  if (!teacher) return { title: BRAND.name };
  const title = `${teacher.name} — ${BRAND.name}`;
  const description = (teacher.bio ?? teacher.expertise ?? t('catalog.metaDescription')).slice(0, 160);
  const image = teacher.avatarUrl ?? teacher.courses.find((c) => c.coverUrl)?.coverUrl ?? undefined;
  return {
    title,
    description,
    alternates: { canonical: `/teachers/${teacher.id}` },
    openGraph: { title: teacher.name, description, type: 'profile', images: image ? [image] : undefined },
  };
}

/** Багшийн нийтийн profile: нэр, bio, нийтлэгдсэн курсууд. */
export default async function TeacherPage({ params }: { params: Params }) {
  const teacher = await fetchTeacher((await params).id);
  if (!teacher) notFound();

  return (
    <main className="page wide" style={{ display: 'grid', gap: 24 }}>
      <div className="teacher-box">
        {teacher.avatarUrl ? <img className="avatar avatar-lg" src={teacher.avatarUrl} alt="" /> : <div className="avatar avatar-lg" />}
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ margin: 0 }}>{teacher.name}</h1>
          {teacher.expertise && <span className="muted">{teacher.expertise}</span>}
        </div>
      </div>
      {teacher.bio && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{teacher.bio}</p>}
      <section>
        <h2>{t('catalog.teacherCourses')}</h2>
        {teacher.courses.length === 0 ? <p className="muted">{t('catalog.noCourses')}</p> : <CourseGrid courses={teacher.courses} />}
      </section>
    </main>
  );
}
