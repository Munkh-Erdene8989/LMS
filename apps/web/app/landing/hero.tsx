import Image from 'next/image';
import { t } from '@/lib/i18n';
import { HeroMotion } from './hero-motion';
import { TrackedLink } from './tracked-link';
import styles from './landing.module.css';

/** Гарчиг үгээр орно (GSAP timeline — hero-motion.tsx). JS-гүй ч бүх контент харагдана. */
export function Hero() {
  const words = t('landing.heroTitle').split(' ');
  // Сүүлийн хоёр үгийг салгахгүй (өнчин мөр гарахгүй).
  if (words.length > 2) words.push(`${words.splice(-2).join(' ')}`);
  // «QPay-аар» зэрэг hyphen-тэй үгийг таслахгүй.
  const lead = t('landing.heroLead').split(/(S+-S+)/);
  return (
    <HeroMotion className={styles.hero}>
      <div className={styles.wrap}>
        <p className={styles.eyebrow}>{t('landing.eyebrowHero')}</p>
        <h1 className={styles.heroTitle}>
          {words.map((w, i) => (
            <span key={i}>
              <span className={styles.word} data-m="word">
                {w}
              </span>{' '}
            </span>
          ))}
        </h1>
        <p className={styles.heroLead} data-m="lead">
          {lead.map((part, i) =>
            i % 2 === 1 ? (
              <span key={i} style={{ whiteSpace: 'nowrap' }}>
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </p>
        <div className={styles.heroCta} data-m="cta">
          <TrackedLink id="hero_browse" href="/courses">
            {t('landing.heroBrowse')}
          </TrackedLink>
          <TrackedLink id="hero_teach" href="/teacher/apply" variant="secondary">
            {t('landing.heroTeach')}
          </TrackedLink>
        </div>
        <div className={styles.heroFrame}>
          <Image
            data-m="img"
            className={styles.heroImg}
            src="/images/hero-learning.webp"
            width={1600}
            height={893}
            sizes="(min-width: 1152px) 1088px, calc(100vw - 32px)"
            alt={t('landing.heroImageAlt')}
            priority
          />
        </div>
      </div>
    </HeroMotion>
  );
}
