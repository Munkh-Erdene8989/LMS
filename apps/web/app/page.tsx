import type { CatalogCourseCard } from '@lms/shared';
import { fetchCatalog } from '@/lib/catalog';
import { t } from '@/lib/i18n';
import { LinkButton } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { Reveal } from './ui/reveal';
import { CommunityPreview } from './landing/community-preview';
import { REFERRAL_FEE_PCT } from './landing/constants';
import { CreditCalculator } from './landing/credit-calculator';
import { Faq } from './landing/faq';
import { FeaturedCourse } from './landing/featured-course';
import { Hero } from './landing/hero';
import { LessonStack } from './landing/lesson-stack';
import { Pricing } from './landing/pricing';
import { Statement } from './landing/statement';
import { TeacherFee } from './landing/teacher-fee';
import styles from './landing/landing.module.css';

export const dynamic = 'force-dynamic';

async function loadFeatured(): Promise<CatalogCourseCard[]> {
  try {
    return (await fetchCatalog({})).items.slice(0, 3);
  } catch {
    return [];
  }
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className={styles.checks}>
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

// Layout өөрөө <main id="main">-ийг өгдөг тул энд <div>.
export default async function HomePage() {
  const featured = await loadFeatured();

  return (
    <div className={styles.landing}>
      <Hero />
      <LessonStack />

      <section className={`${styles.section} ${styles.alt}`} aria-labelledby="calc-h">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <h2 id="calc-h">{t('landing.calcTitle')}</h2>
            <p className={styles.lead}>{t('landing.calcLead')}</p>
            <ol className={styles.steps} aria-label={t('landing.calcStepsLabel')}>
              <li>{t('landing.calcStep1')}</li>
              <li>{t('landing.calcStep2')}</li>
              <li>{t('landing.calcStep3')}</li>
            </ol>
          </div>
          <CreditCalculator />
        </div>
      </section>

      <section className={styles.statement} aria-label={t('landing.statement')}>
        <div className={styles.wrap}>
          <Statement />
        </div>
      </section>

      <section className={styles.section} id="courses" aria-labelledby="courses-h">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <div>
              <h2 id="courses-h">{t('landing.coursesTitle')}</h2>
              <p className={styles.lead}>{t('landing.coursesLead')}</p>
            </div>
            <LinkButton href="/courses" variant="secondary">
              {t('landing.coursesAll')}
            </LinkButton>
          </div>
          {featured.length === 0 ? (
            <EmptyState title={t('landing.coursesEmptyTitle')} description={t('landing.coursesEmptyBody')} />
          ) : (
            <Reveal className={styles.courseGrid}>
              {featured.map((c) => (
                <FeaturedCourse key={c.id} course={c} />
              ))}
            </Reveal>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`} id="teachers" aria-labelledby="teachers-h">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <h2 id="teachers-h">{t('landing.teachersTitle')}</h2>
            <p className={styles.lead}>{t('landing.teachersLead', { pct: REFERRAL_FEE_PCT })}</p>
            <Points items={[t('landing.teachersPoint1'), t('landing.teachersPoint2'), t('landing.teachersPoint3')]} />
            <div>
              <LinkButton href="/teacher/apply">{t('landing.teachersCta')}</LinkButton>
            </div>
          </div>
          <TeacherFee />
        </div>
      </section>

      <section className={styles.section} id="community" aria-labelledby="community-h">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <h2 id="community-h">{t('landing.communityTitle')}</h2>
            <p className={styles.lead}>{t('landing.communityLead')}</p>
            <Points items={[t('landing.communityPoint1'), t('landing.communityPoint2'), t('landing.communityPoint3')]} />
            <div>
              <LinkButton href="/communities" variant="secondary">
                {t('landing.communityLink')}
              </LinkButton>
            </div>
          </div>
          <CommunityPreview />
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`} id="pricing" aria-labelledby="pricing-h">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <div>
              <h2 id="pricing-h">{t('landing.pricingTitle')}</h2>
              <p className={styles.lead}>{t('landing.pricingLead')}</p>
            </div>
          </div>
          <Pricing />
        </div>
      </section>

      <section className={styles.section} id="faq" aria-labelledby="faq-h">
        <div className={`${styles.wrap} ${styles.split}`}>
          <h2 id="faq-h">{t('landing.faqTitle')}</h2>
          <Faq />
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-h">
        <div className={styles.wrap}>
          <h2 id="cta-h">{t('landing.ctaTitle')}</h2>
          <p className={styles.lead}>{t('landing.ctaLead')}</p>
          <LinkButton href="/login">{t('landing.ctaButton')}</LinkButton>
        </div>
      </section>
    </div>
  );
}
