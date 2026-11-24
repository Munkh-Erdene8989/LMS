'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BRAND, type CreditBalanceView, type UnreadCount } from '@lms/shared';
import { api } from '@/lib/client-api';
import { useViewer } from '@/lib/viewer';
import { t } from '@/lib/i18n';
import { CreditPill } from './ui/credit-pill';
import { Dialog } from './ui/dialog';
import { Skeleton } from './ui/skeleton';
import styles from './site-header.module.css';

const POLL_MS = 60_000;
const FOCUS_THROTTLE_MS = 15_000;

const NAV = [
  { href: '/courses', label: 'shell.courses' },
  { href: '/communities', label: 'shell.community' },
  { href: '/learning', label: 'shell.myLearning' },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Дээд цэс: glass sticky, desktop nav, mobile sheet, кредит pill, avatar цэс. */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { viewer, setUser } = useViewer();
  const user = viewer.user;
  // null = тодорхойгүй (уншиж байна); сүлжээний алдааг зочин мэт харуулна (өмнөхтэй адил).
  const authed = viewer.status === 'loading' ? null : viewer.status === 'authed';
  const [unread, setUnread] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const lastPoll = useRef(0);

  // Unread + кредит: зөвхөн auth мэдэгдсэний дараа; interval + focus (throttle).
  const poll = useCallback(() => {
    lastPoll.current = Date.now();
    api<UnreadCount>('/notifications/unread-count')
      .then((r) => setUnread(r.data.count))
      .catch(() => undefined);
    api<CreditBalanceView>('/credits')
      .then((r) => setBalance(r.data.balance))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!authed) return;
    // Route солих, focus, tab идэвхжих — бүгд throttle-той; далд tab-д interval хүсэлт явуулахгүй.
    const onFocus = () => {
      if (!document.hidden && Date.now() - lastPoll.current >= FOCUS_THROTTLE_MS) poll();
    };
    onFocus();
    const timer = setInterval(() => {
      if (!document.hidden) poll();
    }, POLL_MS);
    const onChanged = () => poll();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('notifications:changed', onChanged);
    window.addEventListener('credits:changed', onChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('notifications:changed', onChanged);
      window.removeEventListener('credits:changed', onChanged);
    };
  }, [authed, poll, pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Route солигдоход цэснүүд хаагдана.
  useEffect(() => {
    setMenuOpen(false);
    setSheetOpen(false);
  }, [pathname]);

  // Avatar цэс: Esc / гадна дарахад хаах.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

  async function logout() {
    setMenuOpen(false);
    setSheetOpen(false);
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setBalance(null);
    setUnread(0);
    router.replace('/login');
  }

  const roles = user?.roles ?? [];
  const isTeacher = roles.includes('TEACHER');
  const isAdmin = roles.includes('ADMIN');
  const initial = (user?.name ?? '').trim().charAt(0).toUpperCase() || '•';

  const accountLinks = (
    <>
      <Link href="/me">{t('shell.profile')}</Link>
      <Link href="/credits">{t('shell.credits')}</Link>
      {isTeacher ? (
        <Link href="/teacher/courses">{t('shell.teacherDashboard')}</Link>
      ) : (
        <Link href="/teacher/apply">{t('shell.becomeTeacher')}</Link>
      )}
      {isAdmin && <Link href="/admin">{t('shell.admin')}</Link>}
      <button type="button" onClick={logout}>
        {t('shell.logout')}
      </button>
    </>
  );

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <Link href="/" className={styles.brand}>
        {BRAND.name}
      </Link>

      <nav aria-label={t('shell.navLabel')} className={styles.nav}>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navLink}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          >
            {t(item.label)}
          </Link>
        ))}
      </nav>

      <div className={styles.right} aria-busy={authed === null}>
        {authed === null && (
          <div className={styles.skeletons}>
            <Skeleton width={72} height={34} radius="999px" />
            <Skeleton width={36} height={36} radius="50%" />
          </div>
        )}
        {authed === false && (
          <Link className="btn btn-primary" href="/login">
            {t('shell.login')}
          </Link>
        )}
        {authed && (
          <>
            {balance !== null && <CreditPill balance={balance} />}
            <Link
              href="/notifications"
              className={styles.bell}
              aria-label={unread ? t('notifications.bellUnread', { count: unread }) : t('shell.notifications')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {!!unread && <span className={styles.dot}>{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <div className={styles.account} ref={menuRef}>
              <button
                ref={menuBtnRef}
                type="button"
                className={styles.avatar}
                aria-label={t('shell.account')}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                onClick={() => setMenuOpen((v) => !v)}
              >
                {user?.avatarUrl ? <img src={user.avatarUrl} alt="" width={36} height={36} /> : initial}
              </button>
              {menuOpen && <div className={styles.popover}>{accountLinks}</div>}
            </div>
          </>
        )}
        <button
          type="button"
          className={styles.menuBtn}
          aria-label={t('shell.menuOpen')}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('shell.menu')}>
        <nav aria-label={t('shell.mobileNavLabel')} className={styles.sheet}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
              {t(item.label)}
            </Link>
          ))}
          {authed ? accountLinks : authed === false ? <Link href="/login">{t('shell.login')}</Link> : null}
        </nav>
      </Dialog>
    </header>
  );
}
