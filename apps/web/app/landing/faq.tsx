import { t } from '@/lib/i18n';
import { REFERRAL_FEE_PCT } from './constants';
import styles from './landing.module.css';

const ITEMS = [1, 2, 3, 4, 5, 6] as const;

/** `<details>` — JS-гүй ажиллана, keyboard-д native. */
export function Faq() {
  return (
    <div className={styles.faq}>
      {ITEMS.map((n) => (
        <details key={n} className={styles.faqItem}>
          <summary>{t(`landing.q${n}`)}</summary>
          <p>{t(`landing.a${n}`, { pct: REFERRAL_FEE_PCT })}</p>
        </details>
      ))}
    </div>
  );
}
