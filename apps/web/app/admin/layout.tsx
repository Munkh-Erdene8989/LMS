'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminPendingCounts } from '@lms/shared';
import { withNext } from '@/lib/next-path';
import { formatNumber } from '@/lib/format';
import { hasRole, useViewer } from '@/lib/viewer';
import { t, type MessageKey } from '@/lib/i18n';
import { LoadingRows } from './admin-ui';
import { PendingProvider, totalPending, usePending } from './pending';
import { EmptyState } from '../ui/empty-state';
import styles from './admin.module.css';

type NavItem = { href: string; label: MessageKey; pending?: keyof AdminPendingCounts };

const OVERVIEW: NavItem = { href: '/admin', label: 'adminUi.navOverview' };

const GROUPS: { title: MessageKey; items: NavItem[] }[] = [
  {
    title: 'adminUi.groupUsers',
    items: [
      { href: '/admin/users', label: 'adminOps.navUsers' },
      { href: '/admin/teacher-applications', label: 'teacher.navApplications', pending: 'teacherApplications' },
    ],
  },
  {
    title: 'adminUi.groupContent',
    items: [
      { href: '/admin/course-reviews', label: 'course.navReviews', pending: 'courseReviews' },
      { href: '/admin/categories', label: 'course.navCategories' },
      { href: '/admin/reviews', label: 'review.navAdmin' },
      { href: '/admin/community', label: 'communityAdmin.nav' },
    ],
  },
  {
    title: 'adminUi.groupMoney',
    items: [
      { href: '/admin/payments', label: 'adminOps.navPayments', pending: 'paymentIssues' },
      { href: '/admin/payouts', label: 'payout.navAdmin', pending: 'payouts' },
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

const ALL_ITEMS = [OVERVIEW, ...GROUPS.flatMap((g) => g.items)];

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
    <PendingProvider refreshKey={pathname}>
      <div className={styles.shell}>
        <AdminNav pathname={pathname} />
        <div className={styles.content}>{children}</div>
      </div>
    </PendingProvider>
  );
}

/**
 * Desktop (≥900px): тогтмол sidebar. Mobile: «Цэс» товч + доош нээгдэх drawer
 * (disclosure — Escape, холбоос дарах, хуудас солигдоход хаагдана).
 */
function AdminNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const pending = usePending();
  const navId = useId();
  const current = ALL_ITEMS.find((i) => isActive(pathname, i.href)) ?? OVERVIEW;
  const total = totalPending(pending);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <aside className={styles.sidebar} data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={navId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.menuIcon} aria-hidden="true" />
        <span className={styles.menuText}>
          <span className={styles.menuKicker}>{t('adminUi.menu')}</span>
          <span className={styles.menuCurrent}>{t(current.label)}</span>
        </span>
        {total > 0 && (
          <span className={styles.badge}>
            <span aria-hidden="true">{formatNumber(total)}</span>
            <span className={styles.visuallyHidden}>{t('adminUi.menuPending', { count: formatNumber(total) })}</span>
          </span>
        )}
      </button>

      <nav id={navId} className={styles.nav} aria-label={t('adminUi.navLabel')}>
        <p className={styles.brand}>{t('admin.title')}</p>
        <NavLink item={OVERVIEW} pathname={pathname} pending={pending} />
        {GROUPS.map((g) => (
          <section key={g.title} aria-label={t(g.title)}>
            <h2 className={styles.groupTitle}>{t(g.title)}</h2>
            <ul className={styles.group}>
              {g.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} pathname={pathname} pending={pending} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      {open && <button type="button" className={styles.scrim} aria-label={t('ui.close')} tabIndex={-1} onClick={() => setOpen(false)} />}
    </aside>
  );
}

function NavLink({ item, pathname, pending }: { item: NavItem; pathname: string; pending: AdminPendingCounts | null }) {
  const n = item.pending && pending ? pending[item.pending] : 0;
  return (
    <Link href={item.href} className={styles.link} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
      <span className={styles.linkText}>{t(item.label)}</span>
      {n > 0 && (
        <span className={styles.badge}>
          <span aria-hidden="true">{formatNumber(n)}</span>
          <span className={styles.visuallyHidden}> {t('adminUi.pendingBadge', { count: formatNumber(n) })}</span>
        </span>
      )}
    </Link>
  );
}
