'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import styles from './credit-pill.module.css';

export interface CreditPillProps {
  balance: number;
  href?: string;
}

/** Кредитийн үлдэгдэл pill: утга өөрчлөгдөхөд bump (spring). `/credits` руу линк. */
export function CreditPill({ balance, href = '/credits' }: CreditPillProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const prev = useRef(balance);

  useEffect(() => {
    if (prev.current === balance) return;
    prev.current = balance;
    const el = ref.current;
    const bump = styles.bump;
    if (!el || !bump) return;
    el.classList.remove(bump);
    void el.offsetWidth; // animation дахин эхлүүлэх
    el.classList.add(bump);
  }, [balance]);

  return (
    <Link ref={ref} href={href} className={styles.pill} aria-label={t('ui.creditBalance', { count: formatNumber(balance) })}>
      <span className={styles.coin} aria-hidden="true" />
      <span>{formatNumber(balance)}</span>
    </Link>
  );
}
