'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND, type UnreadCount } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';

const POLL_MS = 60_000;

/** Дээд цэс: нэвтэрсэн бол хонх (уншаагүй тоо) + бүртгэл, үгүй бол нэвтрэх линк. */
export function SiteHeader() {
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<UnreadCount>('/notifications/unread-count')
        .then((r) => {
          if (!alive) return;
          setAuthed(true);
          setUnread(r.data.count);
        })
        .catch(() => alive && setAuthed(false));
    void load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener('focus', load);
    window.addEventListener('notifications:changed', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
      window.removeEventListener('notifications:changed', load);
    };
  }, [pathname]);

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        {BRAND.name}
      </Link>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/courses">{t('catalog.nav')}</Link>
        {authed === false && (
          <Link className="btn btn-ghost" href="/login">
            {t('home.login')}
          </Link>
        )}
        {authed && (
          <>
            <Link
              href="/notifications"
              className="bell"
              aria-label={
                unread ? t('notifications.bellUnread', { count: unread }) : t('notifications.title')
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {!!unread && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <Link href="/learning">{t('learning.nav')}</Link>
            <Link href="/communities">{t('community.nav')}</Link>
            <Link href="/credits">{t('credits.nav')}</Link>
            <Link href="/subscription">{t('subscription.nav')}</Link>
            <Link href="/me">{t('home.profile')}</Link>
          </>
        )}
      </nav>
    </header>
  );
}
