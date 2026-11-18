'use client';

import { useEffect, useState } from 'react';
import type { CreditPackageView, SubscriptionPlanView } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatCredits, formatMnt } from '@/lib/format';
import { t } from '@/lib/i18n';
import { EmptyState } from '../ui/empty-state';
import { LinkButton } from '../ui/button';
import { Reveal } from '../ui/reveal';
import { Skeleton } from '../ui/skeleton';
import styles from './landing.module.css';

type State = { status: 'loading' } | { status: 'done'; packages: CreditPackageView[]; plans: SubscriptionPlanView[] };

/**
 * Үнэ: `/subscription/plans` нийтийн; `/credits/packages` нэвтрэлт шаарддаг тул зочинд 401 → хоосон.
 * Demo флагтай үед client-api өөрөө demo өгөгдөл буцаана.
 */
export function Pricing() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    const load = async <T,>(path: string): Promise<T[]> => {
      try {
        return (await api<T[]>(path)).data;
      } catch {
        return [];
      }
    };
    void Promise.all([load<CreditPackageView>('/credits/packages'), load<SubscriptionPlanView>('/subscription/plans')]).then(
      ([packages, plans]) => {
        if (alive)
          setState({
            status: 'done',
            packages: packages.filter((p) => p.active && !p.isTest).sort((a, b) => a.position - b.position),
            plans: plans.filter((p) => p.active).sort((a, b) => a.position - b.position),
          });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className={styles.priceGrid} role="status" aria-busy="true">
        <span className={styles.srOnly}>{t('landing.pricingLoading')}</span>
        <div className={styles.skelCard}><Skeleton height="100%" /></div>
        <div className={styles.skelCard}><Skeleton height="100%" /></div>
        <div className={styles.skelCard}><Skeleton height="100%" /></div>
      </div>
    );
  }

  if (state.packages.length === 0 && state.plans.length === 0) {
    return (
      <EmptyState
        title={t('landing.pricingEmptyTitle')}
        description={t('landing.pricingEmptyBody')}
        action={<LinkButton href="/credits">{t('landing.pricingEmptyCta')}</LinkButton>}
      />
    );
  }

  return (
    <Reveal className={styles.priceGrid}>
      {state.packages.map((p) => (
        <article key={p.id} className={styles.plan}>
          <h3>{p.name}</h3>
          <p className={styles.planPrice}>{formatMnt(p.priceMnt)}</p>
          <p className={styles.planMeta}>{t('landing.packageMeta', { credits: formatCredits(p.credits) })}</p>
          <LinkButton href="/credits" variant="secondary">
            {t('landing.packageCta')}
          </LinkButton>
        </article>
      ))}
      {state.plans.map((p) => (
        <article key={p.id} className={`${styles.plan} ${styles.planFeatured}`}>
          <h3>{p.name}</h3>
          <p className={styles.planPrice}>{formatMnt(p.priceMnt)}</p>
          <p className={styles.planMeta}>{t('landing.planMeta', { credits: formatCredits(p.credits) })}</p>
          <LinkButton href="/subscription">{t('landing.planCta')}</LinkButton>
        </article>
      ))}
    </Reveal>
  );
}
