'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import styles from './dashboard.module.css';

export interface DashboardNavItem {
  href: string;
  label: MessageKey;
  /** Зөвхөн яг энэ замд идэвхтэй (тойм гэх мэт); анхдагч нь дэд замуудыг ч хамарна. */
  exact?: boolean;
  /** Энэ цэсэнд хамаарах өөр замын угтвар (жишээ нь `/admin/courses/` → «Курсийн хяналт»). */
  alsoMatches?: string[];
  /** Badge-ийн тоо (0 эсвэл байхгүй бол харуулахгүй). */
  badge?: number;
}

export interface DashboardNavGroup {
  title?: MessageKey;
  items: DashboardNavItem[];
}

function isActive(pathname: string, item: DashboardNavItem): boolean {
  if (item.exact) return pathname === item.href;
  if (item.alsoMatches?.some((p) => pathname.startsWith(p))) return true;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Админ ба багшийн самбарын shell. Desktop (≥900px): тогтмол sidebar. Mobile: «Цэс» товч + доош нээгдэх
 * drawer (disclosure — Escape, гадна дарах, хуудас солигдоход хаагдана). Товч дээр одоогийн хуудас ба нийт badge.
 */
export function DashboardShell({
  title,
  navLabel,
  groups,
  pathname,
  children,
}: {
  title: string;
  navLabel: string;
  groups: DashboardNavGroup[];
  pathname: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navId = useId();
  const items = groups.flatMap((g) => g.items);
  const current = items.find((i) => isActive(pathname, i)) ?? items[0];
  const total = items.reduce((n, i) => n + (i.badge ?? 0), 0);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={styles.shell}>
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
            <span className={styles.menuKicker}>{t('dashboard.menu')}</span>
            <span className={styles.menuCurrent}>{current ? t(current.label) : title}</span>
          </span>
          {total > 0 && (
            <span className={styles.badge}>
              <span aria-hidden="true">{formatNumber(total)}</span>
              <span className={styles.visuallyHidden}>{t('dashboard.menuPending', { count: formatNumber(total) })}</span>
            </span>
          )}
        </button>

        <nav id={navId} className={styles.nav} aria-label={navLabel}>
          <p className={styles.brand}>{title}</p>
          {groups.map((g, gi) =>
            g.title ? (
              <section key={g.title} aria-label={t(g.title)}>
                <h2 className={styles.groupTitle}>{t(g.title)}</h2>
                <NavList items={g.items} pathname={pathname} />
              </section>
            ) : (
              <NavList key={gi} items={g.items} pathname={pathname} />
            ),
          )}
        </nav>
        {open && (
          <button type="button" className={styles.scrim} aria-label={t('ui.close')} tabIndex={-1} onClick={() => setOpen(false)} />
        )}
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

function NavList({ items, pathname }: { items: DashboardNavItem[]; pathname: string }) {
  return (
    <ul className={styles.group}>
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className={styles.link} aria-current={isActive(pathname, item) ? 'page' : undefined}>
            <span className={styles.linkText}>{t(item.label)}</span>
            {!!item.badge && (
              <span className={styles.badge}>
                <span aria-hidden="true">{formatNumber(item.badge)}</span>
                <span className={styles.visuallyHidden}> {t('dashboard.pendingBadge', { count: formatNumber(item.badge) })}</span>
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
