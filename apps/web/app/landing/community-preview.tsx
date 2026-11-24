import { t } from '@/lib/i18n';
import { ScrollReveal } from './scroll-reveal';
import styles from './landing.module.css';

const POSTS = [
  { author: 'landing.post1Author', body: 'landing.post1Body', meta: null, teacher: true },
  { author: 'landing.post2Author', body: 'landing.post2Body', meta: 'landing.post2Meta', teacher: false },
  { author: 'landing.post3Author', body: 'landing.post3Body', meta: null, teacher: true },
] as const;

/** Нийгэмлэгийн жишээ feed (статик, тайлбарын зориулалттай). */
export function CommunityPreview() {
  return (
    <ScrollReveal className={styles.feed}>
      <ul aria-label={t('landing.feedLabel')}>
        {POSTS.map((p) => (
          <li key={p.author + p.body} className={p.teacher ? undefined : styles.feedLearner}>
            <span className={styles.avatar} aria-hidden="true">
              {t(p.author).charAt(0)}
            </span>
            <div>
              <b>{t(p.author)}</b>
              <p>{t(p.body)}</p>
              {p.meta ? <small>{t(p.meta)}</small> : null}
            </div>
          </li>
        ))}
      </ul>
    </ScrollReveal>
  );
}
