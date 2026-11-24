import { saleEarning, type MoneyRules } from '@lms/shared';
import { formatCredits, formatMnt } from '@/lib/format';
import { t } from '@/lib/i18n';
import { ScrollReveal } from './scroll-reveal';
import type { VarStyle } from './constants';
import styles from './landing.module.css';

const SAMPLE_CREDITS = 100;

/** Багшийн орлого: referral vs платформын шимтгэл (админы тохиргоо). Томьёо нь API-ийн борлуулалттай ижил (`saleEarning`). */
export function TeacherFee({ rules }: { rules: MoneyRules }) {
  const rows = [
    { label: t('landing.feeReferral'), pct: rules.commissionReferralPercent, hi: true },
    { label: t('landing.feePlatform'), pct: rules.commissionPlatformPercent, hi: false },
  ];
  return (
    <ScrollReveal className={styles.fee}>
      <p className={styles.feeTitle}>{t('landing.feeTitle', { credits: formatCredits(SAMPLE_CREDITS) })}</p>
      {rows.map((r) => (
        <div key={r.label} className={`${styles.feeRow} ${r.hi ? styles.feeHi : ''}`}>
          <div>
            <b>{r.label}</b>
            <span>{t('landing.feePct', { pct: r.pct })}</span>
          </div>
          <strong>{formatMnt(saleEarning(SAMPLE_CREDITS, rules.creditPriceMnt, r.pct).amountMnt)}</strong>
          <div className={styles.feeTrack} aria-hidden="true">
            <i style={{ '--w': (100 - r.pct) / 100 } as VarStyle} />
          </div>
        </div>
      ))}
      <p className={styles.note}>{t('landing.feeNote')}</p>
    </ScrollReveal>
  );
}
