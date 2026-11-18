import { t } from '@/lib/i18n';
import { LinkButton } from '../ui/button';
import type { VarStyle } from './constants';
import styles from './landing.module.css';

/** Гарчиг үгээр орно (CSS animation, нэг удаа). JS-гүй ч харагдана. */
export function Hero() {
  const words = t('landing.heroTitle').split(' ');
  return (
    <section className={styles.hero}>
      <div className={styles.wrap}>
        <h1 className={styles.heroTitle}>
          {words.map((w, i) => (
            <span key={i}>
              <span className={styles.word} style={{ '--i': i } as VarStyle}>
                {w}
              </span>{' '}
            </span>
          ))}
        </h1>
        <p className={styles.heroLead}>{t('landing.heroLead')}</p>
        <div className={styles.heroCta}>
          <LinkButton href="/courses">{t('landing.heroBrowse')}</LinkButton>
          <LinkButton href="/teacher/apply" variant="secondary">
            {t('landing.heroTeach')}
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
