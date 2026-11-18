/**
 * Түр demo өгөгдөл (ticket 33b). ЗӨВХӨН ХАРУУЛАХ.
 *
 * `DEMO_ENABLED` нь build үед шингэдэг (`NEXT_PUBLIC_DEMO_DATA=1`). Флаггүй build-д `false` литерал болж,
 * бүх залгах цэг `if (DEMO_ENABLED)` хамгаалалттай тул энэ модуль (data.ts, cover.ts-тэй нь) bundle-д орохгүй.
 * Production-д энэ env-ийг ХЭЗЭЭ Ч тавихгүй.
 */
import { analyticsPeriods, ubToday, addDays, type CatalogCourseCard, type CatalogPage, type SubscriptionOverview } from '@lms/shared';
import {
  DEMO_CATEGORIES,
  DEMO_COMMENTS,
  DEMO_COURSES,
  DEMO_COURSE_CARDS,
  DEMO_CREDIT_BALANCE,
  DEMO_CREDIT_HISTORY,
  DEMO_CREDIT_PACKAGES,
  DEMO_EARNINGS,
  DEMO_MEMBERS,
  DEMO_NOTIFICATIONS,
  DEMO_PAYOUTS,
  DEMO_POSTS,
  DEMO_SUBSCRIPTION_PLANS,
  DEMO_TEACHERS,
  DEMO_TEACHER_COURSE_ROWS,
  DEMO_TEACHER_LESSON_ROWS,
  ZERO_TOTALS,
  addTotals,
  demoReviewPage,
  demoSalesPoint,
  demoTeacherProfile,
} from './data';

export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_DATA === '1';

export const DEMO_MUTATION_MESSAGE = 'Demo курс — худалдан авах боломжгүй';

/** Mutation нь `demo-` ID-д хүрвэл (path эсвэл body) алдаа буцаах ёстой эсэх. */
export function isDemoMutation(path: string, body: unknown): boolean {
  if (path.includes('demo-')) return true;
  try {
    return body !== undefined && JSON.stringify(body).includes('demo-');
  } catch {
    return false;
  }
}

function catalogPage(params: URLSearchParams): CatalogPage {
  let items: CatalogCourseCard[] = [...DEMO_COURSE_CARDS];

  const q = params.get('q')?.trim().toLowerCase();
  if (q) items = items.filter((c) => `${c.title} ${c.excerpt} ${c.teacher.name}`.toLowerCase().includes(q));

  const category = params.get('category');
  if (category) items = items.filter((c) => c.category?.slug === category || c.category?.parent?.slug === category);

  const level = params.get('level');
  if (level) items = items.filter((c) => c.level === level);

  const minPrice = Number(params.get('minPrice'));
  if (params.get('minPrice') && Number.isFinite(minPrice)) items = items.filter((c) => c.priceCredits >= minPrice);
  const maxPrice = Number(params.get('maxPrice'));
  if (params.get('maxPrice') && Number.isFinite(maxPrice)) items = items.filter((c) => c.priceCredits <= maxPrice);
  const minRating = Number(params.get('minRating'));
  if (params.get('minRating') && Number.isFinite(minRating)) items = items.filter((c) => (c.rating.average ?? 0) >= minRating);
  if (params.get('freePreview')) items = items.filter((c) => c.hasFreePreview);

  const sort = params.get('sort') ?? (q ? 'relevance' : 'newest');
  if (sort === 'price_asc') items.sort((a, b) => a.priceCredits - b.priceCredits);
  else if (sort === 'price_desc') items.sort((a, b) => b.priceCredits - a.priceCredits);
  else if (sort === 'rating') items.sort((a, b) => (b.rating.average ?? -1) - (a.rating.average ?? -1));
  else if (sort === 'newest') items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const pageSize = Math.min(Math.max(Number(params.get('pageSize')) || 12, 1), 50);
  const page = Math.max(Number(params.get('page')) || 1, 1);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

function subscriptionOverview(): SubscriptionOverview {
  return {
    subscription: {
      id: 'demo-sub-1',
      status: 'ACTIVE',
      plan: DEMO_SUBSCRIPTION_PLANS[0]!,
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      nextRenewalAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      pastDueSince: null,
      pauseAt: null,
      canceledAt: null,
      pausedAt: null,
    },
    pendingPayment: null,
    card: null,
    cardSupported: false,
  };
}

function analytics(params: URLSearchParams) {
  const to = params.get('to') ?? ubToday();
  const from = params.get('from') ?? addDays(to, -29);
  const granularity = params.get('granularity') === 'month' ? 'month' : 'day';
  const series = analyticsPeriods(from, to, granularity).map((period) => ({ period, ...demoSalesPoint(period) }));
  const totals = series.reduce((acc, p) => addTotals(acc, p), ZERO_TOTALS);
  const referral = {
    sales: Math.round(totals.sales * 0.3),
    credits: Math.round(totals.credits * 0.3),
    grossMnt: Math.round(totals.grossMnt * 0.3),
    earningMnt: Math.round(totals.grossMnt * 0.3 * 0.9),
  };
  const platform = {
    sales: totals.sales - referral.sales,
    credits: totals.credits - referral.credits,
    grossMnt: totals.grossMnt - referral.grossMnt,
    earningMnt: Math.round((totals.grossMnt - referral.grossMnt) * 0.6),
  };
  return {
    range: { from, to, granularity, timezone: 'Asia/Ulaanbaatar' as const },
    totals: { ...totals, earningMnt: referral.earningMnt + platform.earningMnt },
    series,
    attribution: { REFERRAL: referral, PLATFORM: platform },
    testSales: { sales: 0, credits: 0 },
    courses: DEMO_TEACHER_COURSE_ROWS,
    lessons: DEMO_TEACHER_LESSON_ROWS,
    balanceMnt: DEMO_EARNINGS.balanceMnt,
  };
}

function communityFeed(teacherId: string) {
  const posts = DEMO_POSTS[teacherId] ?? [];
  return { pinned: posts.filter((p) => p.pinned), items: posts.filter((p) => !p.pinned), nextCursor: null };
}

/**
 * API path (query-тэй) → demo fixture. Танихгүй path-д `undefined` (залгах цэг анхны алдаагаа дамжуулна).
 * Зөвхөн GET-ийн хариу.
 */
export function demoFor(path: string): unknown | undefined {
  const [pathname = '', query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const seg = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = seg;

  if (a === 'categories' && !b) return DEMO_CATEGORIES;

  if (a === 'catalog') {
    if (b === 'courses' && !c) return catalogPage(params);
    if (b === 'courses' && c && !d) return DEMO_COURSES.find((x) => x.id === c)?.detail;
    if (b === 'courses' && c && d === 'reviews') return demoReviewPage(c);
    if (b === 'teachers' && c) return demoTeacherProfile(c);
    return undefined;
  }

  if (a === 'credits') {
    if (!b) return DEMO_CREDIT_BALANCE;
    if (b === 'packages') return DEMO_CREDIT_PACKAGES;
    if (b === 'history') return { items: DEMO_CREDIT_HISTORY, nextCursor: null };
    return undefined;
  }

  if (a === 'subscription') {
    if (b === 'plans') return DEMO_SUBSCRIPTION_PLANS;
    if (!b) return subscriptionOverview();
    return undefined;
  }

  if (a === 'notifications') {
    if (!b) return { items: DEMO_NOTIFICATIONS, nextCursor: null };
    if (b === 'unread-count') return { count: DEMO_NOTIFICATIONS.filter((n) => !n.readAt).length };
    return undefined;
  }

  if (a === 'communities') {
    if (!b) {
      return ['demo-teacher-1', 'demo-teacher-4'].map((id) => {
        const t = DEMO_TEACHERS.find((x) => x.ref.id === id)!;
        const posts = DEMO_POSTS[id] ?? [];
        return {
          teacher: { id, name: t.ref.name, avatarUrl: null },
          role: 'MEMBER' as const,
          postCount: posts.length,
          lastPostAt: posts[0]?.createdAt ?? null,
        };
      });
    }
    const t = DEMO_TEACHERS.find((x) => x.ref.id === b);
    if (!t) return undefined;
    if (c === 'posts') return communityFeed(b);
    if (!c) {
      return {
        teacher: { id: b, name: t.ref.name, avatarUrl: null, expertise: t.expertise },
        role: 'MEMBER' as const,
        memberCount: 120 + DEMO_TEACHERS.indexOf(t) * 37,
        upcomingLive: [],
      };
    }
    return undefined;
  }

  if (a === 'community' && b === 'posts' && c && d === 'comments') {
    return { items: DEMO_COMMENTS, nextCursor: null };
  }

  if (a === 'teacher') {
    if (b === 'earnings') return DEMO_EARNINGS;
    if (b === 'payouts') return DEMO_PAYOUTS;
    if (b === 'analytics' && !c) return analytics(params);
    if (b === 'community' && c === 'members') {
      return { items: DEMO_MEMBERS, total: DEMO_MEMBERS.length, page: 1, pageSize: 20 };
    }
    return undefined;
  }

  return undefined;
}
