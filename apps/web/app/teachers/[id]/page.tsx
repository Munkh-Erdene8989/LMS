import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import { fetchTeacher } from '@/lib/catalog';
import { LinkButton } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { CourseGrid } from '../../courses/catalog-ui';
import s from './teachers.module.css';

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
    <div className="page wide">
      <div className={s.stack}>
        <div className={s.head}>
          {teacher.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={s.avatar} src={teacher.avatarUrl} alt="" width={96} height={96} />
          ) : (
            <span className={`${s.avatar} ${s.initial}`} aria-hidden="true">
              {teacher.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className={s.headText}>
            <h1 className={s.name}>{teacher.name}</h1>
            {teacher.expertise && <span className={s.expertise}>{teacher.expertise}</span>}
          </div>
          {/* Гишүүн эсэхийг community хуудас өөрөө шалгаж тайлбарлана */}
          <LinkButton variant="secondary" className={s.action} href={`/communities/${teacher.id}`}>
            {t('community.open')}
          </LinkButton>
        </div>
        {teacher.bio && <p className={s.bio}>{teacher.bio}</p>}
        <section aria-labelledby="teacher-courses">
          <h2 id="teacher-courses" className={s.sectionTitle}>
            {t('catalog.teacherCourses')}
          </h2>
          {teacher.courses.length === 0 ? <EmptyState title={t('catalog.noCourses')} /> : <CourseGrid courses={teacher.courses} />}
        </section>
      </div>
    </div>
  );
}
