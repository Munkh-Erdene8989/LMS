'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { withNext } from '@/lib/next-path';
import { hasRole, useViewer } from '@/lib/viewer';
import { t, type MessageKey } from '@/lib/i18n';
import { LoadingRows } from './admin-ui';
import { EmptyState } from '../ui/empty-state';
import styles from './admin.module.css';

type NavItem = [href: string, label: MessageKey];

const GROUPS: { title: MessageKey; items: NavItem[] }[] = [
  {
    title: 'adminUi.groupUsers',
    items: [
      ['/admin/users', 'adminOps.navUsers'],
      ['/admin/teacher-applications', 'teacher.navApplications'],
    ],
  },
  {
    title: 'adminUi.groupContent',
    items: [
      ['/admin/course-reviews', 'course.navReviews'],
      ['/admin/categories', 'course.navCategories'],
      ['/admin/reviews', 'review.navAdmin'],
      ['/admin/community', 'communityAdmin.nav'],
    ],
  },
  {
    title: 'adminUi.groupMoney',
    items: [
      ['/admin/payments', 'adminOps.navPayments'],
      ['/admin/payouts', 'payout.navAdmin'],
      ['/admin/credit-packages', 'credits.navAdmin'],
      ['/admin/subscription-plans', 'subscription.navAdmin'],
      ['/admin/reports', 'adminOps.navReports'],
    ],
  },
  {
    title: 'adminUi.groupSystem',
    items: [
      ['/admin', 'admin.navSettings'],
      ['/admin/audit', 'admin.navAudit'],
      ['/admin/legal', 'admin.navLegal'],
    ],
  },
];

/** Курсийн дэлгэрэнгүй (`/admin/courses/[id]`) нь «Курсийн хяналт»-ын дэд хуудас. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  if (href === '/admin/course-reviews' && pathname.startsWith('/admin/courses/')) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
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
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <p className={styles.brand}>{t('admin.title')}</p>
        <nav className={styles.nav} aria-label={t('adminUi.navLabel')}>
          {GROUPS.map((g) => (
            <section key={g.title} aria-label={t(g.title)} className={styles.groupItem}>
              <h2 className={styles.groupTitle}>{t(g.title)}</h2>
              <ul className={styles.group}>
                {g.items.map(([href, label]) => (
                  <li key={href} className={styles.groupItem}>
                    <Link href={href} className={styles.link} aria-current={isActive(pathname, href) ? 'page' : undefined}>
                      {t(label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
