import { formatCredits, formatMnt } from '@/lib/format';
import { t } from '@/lib/i18n';
import { ScrollReveal } from './scroll-reveal';
import { PLATFORM_FEE_PCT, REFERRAL_FEE_PCT, teacherEarningMnt, type VarStyle } from './constants';
import styles from './landing.module.css';

const SAMPLE_CREDITS = 100;

/** Багшийн орлого: referral (10%) vs платформ (40%). Томьёо: credits × ₮ × (1 − шимтгэл) — SPEC «Мөнгөний дүрэм». */
export function TeacherFee() {
  const rows = [
    { label: t('landing.feeReferral'), pct: REFERRAL_FEE_PCT, hi: true },
    { label: t('landing.feePlatform'), pct: PLATFORM_FEE_PCT, hi: false },
  ];
  return (
    <ScrollReveal className={styles.fee}>
      <p className={styles.feeTitle}>{t('landing.feeTitle', { credits: formatCredits(SAMPLE_CREDITS) })}</p>
      {rows.map((r) => (
        <div key={r.pct} className={`${styles.feeRow} ${r.hi ? styles.feeHi : ''}`}>
          <div>
            <b>{r.label}</b>
            <span>{t('landing.feePct', { pct: r.pct })}</span>
          </div>
          <strong>{formatMnt(teacherEarningMnt(SAMPLE_CREDITS, r.pct))}</strong>
          <div className={styles.feeTrack} aria-hidden="true">
            <i style={{ '--w': (100 - r.pct) / 100 } as VarStyle} />
          </div>
        </div>
      ))}
      <p className={styles.note}>{t('landing.feeNote')}</p>
    </ScrollReveal>
  );
}
