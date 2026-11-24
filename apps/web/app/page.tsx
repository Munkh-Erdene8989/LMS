import type { CatalogCourseCard } from '@lms/shared';
import { fetchCatalog } from '@/lib/catalog';
import { t } from '@/lib/i18n';
import Image from 'next/image';
import { LinkButton } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { CommunityPreview } from './landing/community-preview';
import { REFERRAL_FEE_PCT } from './landing/constants';
import { CreditCalculator } from './landing/credit-calculator';
import { Faq } from './landing/faq';
import { FeaturedCourse } from './landing/featured-course';
import { Hero } from './landing/hero';
import { ScrollReveal } from './landing/scroll-reveal';
import { SectionView } from './landing/section-view';
import { TrackedLink } from './landing/tracked-link';
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

// Layout өөрөө main-ийг өгдөг тул энд <div>.
export default async function HomePage() {
  const featured = await loadFeatured();

  return (
    <div className={styles.landing}>
      <SectionView />
      <Hero />
      <LessonStack />

      <section className={`${styles.section} ${styles.alt}`} aria-labelledby="calc-h" data-track-section="calculator">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t('landing.eyebrowCalc')}</p>
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

      <section className={styles.statement} aria-label={t('landing.statement')} data-track-section="statement">
        <div className={styles.wrap}>
          <Statement />
        </div>
      </section>

      <section className={styles.section} id="courses" aria-labelledby="courses-h" data-track-section="courses">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <div>
              <p className={styles.eyebrow}>{t('landing.eyebrowCourses')}</p>
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
            <ScrollReveal className={styles.courseGrid} each refresh>
              {featured.map((c) => (
                <FeaturedCourse key={c.id} course={c} />
              ))}
            </ScrollReveal>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`} id="teachers" aria-labelledby="teachers-h" data-track-section="teachers">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t('landing.eyebrowTeachers')}</p>
            <h2 id="teachers-h">{t('landing.teachersTitle')}</h2>
            <p className={styles.lead}>{t('landing.teachersLead', { pct: REFERRAL_FEE_PCT })}</p>
            <Points items={[t('landing.teachersPoint1'), t('landing.teachersPoint2'), t('landing.teachersPoint3')]} />
            <div>
              <TrackedLink id="teachers_apply" href="/teacher/apply">
                {t('landing.teachersCta')}
              </TrackedLink>
            </div>
          </div>
          <div className={styles.stack}>
            <div className={styles.photo}>
              <Image
                src="/images/teacher-recording.webp"
                width={900}
                height={1117}
                sizes="(min-width: 900px) 520px, calc(100vw - 32px)"
                alt={t('landing.teacherImageAlt')}
                className={styles.photoImg}
              />
            </div>
            <TeacherFee />
          </div>
        </div>
      </section>

      <section className={styles.section} id="community" aria-labelledby="community-h" data-track-section="community">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t('landing.eyebrowCommunity')}</p>
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

      <section className={`${styles.section} ${styles.alt}`} id="pricing" aria-labelledby="pricing-h" data-track-section="pricing">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <div>
              <p className={styles.eyebrow}>{t('landing.eyebrowPricing')}</p>
              <h2 id="pricing-h">{t('landing.pricingTitle')}</h2>
              <p className={styles.lead}>{t('landing.pricingLead')}</p>
            </div>
          </div>
          <Pricing />
        </div>
      </section>

      <section className={styles.section} id="faq" aria-labelledby="faq-h" data-track-section="faq">
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t('landing.eyebrowFaq')}</p>
            <h2 id="faq-h">{t('landing.faqTitle')}</h2>
          </div>
          <Faq />
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-h" data-track-section="cta">
        <div className={`${styles.wrap} ${styles.ctaGrid}`}>
          <ScrollReveal className={styles.ctaCopy} each stagger={0.08}>
            <h2 id="cta-h">{t('landing.ctaTitle')}</h2>
            <p className={styles.lead}>{t('landing.ctaLead')}</p>
            <div>
              <TrackedLink id="cta_register" href="/login">
                {t('landing.ctaButton')}
              </TrackedLink>
            </div>
          </ScrollReveal>
          <div className={styles.ctaPhoto}>
            <Image
              src="/images/cta-community.webp"
              width={1200}
              height={805}
              sizes="(min-width: 900px) 520px, calc(100vw - 32px)"
              alt={t('landing.ctaImageAlt')}
              className={styles.photoImg}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
