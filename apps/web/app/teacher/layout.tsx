'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasRole, useViewer } from '@/lib/viewer';
import { t, type MessageKey } from '@/lib/i18n';
import s from './teacher.module.css';

const NAV: { href: string; label: MessageKey }[] = [
  { href: '/teacher/courses', label: 'course.myCourses' },
  { href: '/teacher/assignments', label: 'assignment.inboxTitle' },
  { href: '/teacher/earnings', label: 'earnings.title' },
  { href: '/teacher/analytics', label: 'analytics.title' },
  { href: '/teacher/live', label: 'live.calendarTitle' },
  { href: '/teacher/referral', label: 'referral.title' },
  { href: '/teacher/community', label: 'community.membersTitle' },
  { href: '/teacher/apply', label: 'teacherUi.navProfile' },
];

const APPLY = '/teacher/apply';

/**
 * Багшийн dashboard shell: зүүн nav (mobile-д дээд chip). `/teacher/apply` нь багш болоогүй хэрэглэгчид
 * shell-гүй (өргөдлийн хуудас), багш бол банкны данс засахад shell-тэй харагдана.
 */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isApply = pathname === APPLY;
  const isTeacher = hasRole(useViewer().viewer, 'TEACHER');

  if (isApply && !isTeacher) return <div className={s.bare}>{children}</div>;

  return (
    <div className={s.shell}>
      <nav className={s.nav} aria-label={t('teacherUi.navLabel')}>
        <p className={s.navTitle} aria-hidden="true">
          {t('teacherUi.navLabel')}
        </p>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={s.navLink} aria-current={pathname.startsWith(n.href) ? 'page' : undefined}>
            {t(n.label)}
          </Link>
        ))}
      </nav>
      <div className={s.content}>{children}</div>
    </div>
  );
}
