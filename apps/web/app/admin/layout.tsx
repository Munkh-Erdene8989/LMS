'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthUser } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';

const NAV: [href: string, label: MessageKey][] = [
  ['/admin', 'admin.navSettings'],
  ['/admin/teacher-applications', 'teacher.navApplications'],
  ['/admin/course-reviews', 'course.navReviews'],
  ['/admin/categories', 'course.navCategories'],
  ['/admin/credit-packages', 'credits.navAdmin'],
  ['/admin/audit', 'admin.navAudit'],
  ['/admin/legal', 'admin.navLegal'],
];

/** Web-ийн шалгалт зөвхөн UX-д; бодит эрхийн шалгалт API дээр (`@Auth('ADMIN')`). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');

  useEffect(() => {
    api<AuthUser>('/me')
      .then((r) => setState(r.data.roles.includes('ADMIN') ? 'ok' : 'forbidden'))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
        else setState('forbidden');
      });
  }, [router]);

  if (state === 'loading') return <main className="page">{t('me.loading')}</main>;
  if (state === 'forbidden') return <main className="page">{t('admin.forbidden')}</main>;

  return (
    <div className="page wide" style={{ display: 'grid', gap: 16 }}>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ marginRight: 8, alignSelf: 'center' }}>{t('admin.title')}</strong>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className={pathname === href ? 'btn' : 'btn btn-ghost'}>
            {t(label)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
