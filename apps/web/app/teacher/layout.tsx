'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { hasRole, useViewer } from '@/lib/viewer';
import { t } from '@/lib/i18n';
import { DashboardShell, type DashboardNavGroup } from '../ui/dashboard-shell';
import { UnreviewedProvider, useUnreviewed } from './pending';
import s from './teacher.module.css';

const APPLY = '/teacher/apply';

function navGroups(unreviewed: number | null): DashboardNavGroup[] {
  return [
    { items: [{ href: '/teacher', label: 'teacherUi.navOverview', exact: true }] },
    {
      title: 'teacherUi.groupTeaching',
      items: [
        { href: '/teacher/courses', label: 'course.myCourses' },
        { href: '/teacher/assignments', label: 'assignment.inboxTitle', badge: unreviewed ?? undefined },
        { href: '/teacher/live', label: 'live.calendarTitle' },
        { href: '/teacher/community', label: 'community.membersTitle' },
      ],
    },
    {
      title: 'teacherUi.groupIncome',
      items: [
        { href: '/teacher/earnings', label: 'earnings.title' },
        { href: '/teacher/analytics', label: 'analytics.title' },
        { href: '/teacher/referral', label: 'referral.title' },
      ],
    },
    { title: 'teacherUi.groupAccount', items: [{ href: APPLY, label: 'teacherUi.navProfile' }] },
  ];
}

/**
 * Багшийн dashboard shell (админтай нийтлэг `DashboardShell`). `/teacher/apply` нь багш болоогүй хэрэглэгчид
 * shell-гүй (өргөдлийн хуудас), багш бол банкны данс засахад shell-тэй харагдана.
 */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTeacher = hasRole(useViewer().viewer, 'TEACHER');

  if (pathname === APPLY && !isTeacher) return <div className={s.bare}>{children}</div>;

  return (
    <UnreviewedProvider enabled={isTeacher} refreshKey={pathname}>
      <TeacherShell pathname={pathname}>{children}</TeacherShell>
    </UnreviewedProvider>
  );
}

function TeacherShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const unreviewed = useUnreviewed();
  return (
    <DashboardShell title={t('teacherUi.navLabel')} navLabel={t('teacherUi.navLabel')} groups={navGroups(unreviewed)} pathname={pathname}>
      {children}
    </DashboardShell>
  );
}
