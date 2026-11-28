'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminPendingCounts } from '@lms/shared';
import { withNext } from '@/lib/next-path';
import { hasRole, useViewer } from '@/lib/viewer';
import { t } from '@/lib/i18n';
import { LoadingRows } from './admin-ui';
import { PendingProvider, usePending } from './pending';
import { DashboardShell, type DashboardNavGroup } from '../ui/dashboard-shell';
import { EmptyState } from '../ui/empty-state';
import styles from '../ui/dashboard.module.css';

function navGroups(p: AdminPendingCounts | null): DashboardNavGroup[] {
  return [
    { items: [{ href: '/admin', label: 'adminUi.navOverview', exact: true }] },
    {
      title: 'adminUi.groupUsers',
      items: [
        { href: '/admin/users', label: 'adminOps.navUsers' },
        { href: '/admin/teacher-applications', label: 'teacher.navApplications', badge: p?.teacherApplications },
      ],
    },
    {
      title: 'adminUi.groupContent',
      items: [
        // Курсийн дэлгэрэнгүй (`/admin/courses/[id]`) нь «Курсийн хяналт»-ын дэд хуудас.
        { href: '/admin/course-reviews', label: 'course.navReviews', alsoMatches: ['/admin/courses/'], badge: p?.courseReviews },
        { href: '/admin/categories', label: 'course.navCategories' },
        { href: '/admin/reviews', label: 'review.navAdmin' },
        { href: '/admin/community', label: 'communityAdmin.nav' },
      ],
    },
    {
      title: 'adminUi.groupMoney',
      items: [
        { href: '/admin/payments', label: 'adminOps.navPayments', badge: p?.paymentIssues },
        { href: '/admin/payouts', label: 'payout.navAdmin', badge: p?.payouts },
        { href: '/admin/credit-packages', label: 'credits.navAdmin' },
        { href: '/admin/subscription-plans', label: 'subscription.navAdmin' },
        { href: '/admin/reports', label: 'adminOps.navReports' },
      ],
    },
    {
      title: 'adminUi.groupSystem',
      items: [
        { href: '/admin/settings', label: 'admin.navSettings' },
        { href: '/admin/audit', label: 'admin.navAudit' },
        { href: '/admin/legal', label: 'admin.navLegal' },
      ],
    },
  ];
}

/** Web-ийн шалгалт зөвхөн UX-д; бодит эрхийн шалгалт API дээр (`@Auth('ADMIN')`). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { viewer } = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const state =
    viewer.status === 'loading' || viewer.status === 'guest' ? 'loading' : hasRole(viewer, 'ADMIN') ? 'ok' : 'forbidden';

  useEffect(() => {
    if (viewer.status === 'guest') router.replace(withNext('/login', pathname));
  }, [viewer.status, router, pathname]);

  if (state === 'loading') {
    return (
      <div className={styles.shell}>
        <LoadingRows rows={3} />
      </div>
    );
  }
  if (state === 'forbidden') {
    return (
      <div className={styles.shell}>
        <EmptyState title={t('admin.forbidden')} />
      </div>
    );
  }

  return (
    <PendingProvider refreshKey={pathname}>
      <AdminShell pathname={pathname}>{children}</AdminShell>
    </PendingProvider>
  );
}

function AdminShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const pending = usePending();
  return (
    <DashboardShell title={t('admin.title')} navLabel={t('adminUi.navLabel')} groups={navGroups(pending)} pathname={pathname}>
      {children}
    </DashboardShell>
  );
}
