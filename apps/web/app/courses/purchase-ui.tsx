'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type {
  CreditBalanceView,
  PublicCourseDetail,
  PublicLessonItem,
  PurchaseResult,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { withNext } from '@/lib/next-path';

/** Худалдан авах зүйл (баталгаажуулах цонхонд) */
interface Target {
  kind: 'LESSON' | 'COURSE';
  id: string;
  title: string;
  credits: number;
}

interface PurchaseState {
  course: PublicCourseDetail;
  ownsLesson: (lessonId: string) => boolean;
  start: (target: Target) => void;
}

const Ctx = createContext<PurchaseState | null>(null);

function usePurchase(): PurchaseState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('PurchaseProvider алга');
  return ctx;
}

const credits = (n: number) => (n === 0 ? t('catalog.free') : t('catalog.credits', { count: formatNumber(n) }));

/**
 * Курсийн худалдан авалтын төлөв (server-ээс ирсэн `PublicCourseDetail`-ээс эхэлнэ). Server render-ийн
 * access cookie хугацаа нь дууссан байж болох тул mount үед refresh хийж (шаардлагатай бол) дахин уншина.
 */
export function PurchaseProvider({ initial, children }: { initial: PublicCourseDetail; children: ReactNode }) {
  const router = useRouter();
  const [course, setCourse] = useState(initial);
  const [target, setTarget] = useState<Target | null>(null);

  const reload = useCallback(async () => {
    const r = await api<PublicCourseDetail>(`/catalog/courses/${initial.id}`);
    setCourse(r.data);
    return r.data;
  }, [initial.id]);

  useEffect(() => {
    setCourse(initial);
  }, [initial]);

  useEffect(() => {
    if (initial.viewer) return;
    // Нэвтэрсэн ч SSR зочин гэж үзсэн бол (access token дууссан) — refresh хийгээд хуудсыг шинэчилнэ.
    api('/me')
      .then(() => reload())
      .then((fresh) => {
        if (fresh.viewer) router.refresh();
      })
      .catch(() => undefined);
  }, [initial.viewer, reload, router]);

  const ownsLesson = useCallback(
    (lessonId: string) => !!course.viewer && (course.viewer.ownsCourse || course.viewer.ownedLessonIds.includes(lessonId)),
    [course.viewer],
  );

  return (
    <Ctx.Provider value={{ course, ownsLesson, start: setTarget }}>
      {children}
      {target && (
        <ConfirmDialog
          target={target}
          onClose={() => setTarget(null)}
          onDone={async () => {
            await reload().catch(() => undefined);
            router.refresh();
          }}
          onPriceChanged={async () => {
            const fresh = await reload().catch(() => null);
            if (!fresh) return null;
            if (target.kind === 'COURSE') return fresh.pricing.payableCredits;
            const lesson = fresh.sections.flatMap((s) => s.lessons).find((l) => l.id === target.id);
            return lesson?.priceCredits ?? null;
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** Curriculum-ийн мөр бүрийн үйлдэл: үзэх / үнэгүй үзэх / худалдаж авах. */
export function LessonAction({ lesson }: { lesson: PublicLessonItem }) {
  const { course, ownsLesson, start } = usePurchase();
  const href = `/courses/${course.id}/lessons/${lesson.id}`;
  if (ownsLesson(lesson.id) || course.viewer?.canViewAll) {
    return (
      <Link className="pill pill-owned" href={href}>
        {t('purchase.open')}
      </Link>
    );
  }
  return (
    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {lesson.isFreePreview ? (
        <Link className="pill" href={href}>
          {t('catalog.preview')}
        </Link>
      ) : (
        <LockIcon />
      )}
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => start({ kind: 'LESSON', id: lesson.id, title: lesson.title, credits: lesson.priceCredits })}
      >
        {t('purchase.buyLesson', { price: credits(lesson.priceCredits) })}
      </button>
    </span>
  );
}

/** Курсийн үнийн хайрцаг: хувийн үнэ (өмнө төлсөн хасагдсан) + бүтнээр авах. */
export function CoursePriceBox() {
  const { course, start } = usePurchase();
  const { pricing, viewer } = course;
  const forSale = pricing.listCredits > 0;

  return (
    <aside className="card price-box">
      <span className="muted">{t('catalog.fullPrice')}</span>
      <strong style={{ fontSize: 24 }}>{viewer?.ownsCourse ? t('purchase.ownedCourse') : credits(pricing.payableCredits)}</strong>
      {!viewer?.ownsCourse && pricing.alreadySpentCredits > 0 && (
        <small className="muted">
          {t('purchase.deducted', { list: formatNumber(pricing.listCredits), spent: formatNumber(pricing.alreadySpentCredits) })}
        </small>
      )}
      {pricing.lessonsTotalCredits > pricing.listCredits && (
        <small className="muted">{t('catalog.lessonsTotal', { count: pricing.lessonsTotalCredits })}</small>
      )}
      {viewer?.canViewAll ? (
        <small className="muted">{viewer.isTeacher ? t('purchase.yourCourse') : t('purchase.adminAccess')}</small>
      ) : viewer?.ownsCourse ? (
        <small className="muted">{t('purchase.ownedCourseHint')}</small>
      ) : forSale ? (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => start({ kind: 'COURSE', id: course.id, title: course.title, credits: pricing.payableCredits })}
          >
            {t('purchase.buyCourse')}
          </button>
          <small className="muted">{t('purchase.courseHint')}</small>
        </>
      ) : (
        <small className="muted">{t('purchase.notForSale')}</small>
      )}
    </aside>
  );
}

/** Түгжээтэй lesson-ы хуудсанд: тайлбар + худалдаж авах товч. */
export function LockedLesson({ lesson }: { lesson: PublicLessonItem }) {
  const { course, start } = usePurchase();
  const isTeacher = !!course.viewer?.isTeacher;
  return (
    <div className="card" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <h1 style={{ margin: 0 }}>{lesson.title}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('purchase.lockedHint')}
      </p>
      {!isTeacher && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => start({ kind: 'LESSON', id: lesson.id, title: lesson.title, credits: lesson.priceCredits })}
          >
            {t('purchase.buyLesson', { price: credits(lesson.priceCredits) })}
          </button>
          {course.pricing.listCredits > 0 && !course.viewer?.ownsCourse && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                start({ kind: 'COURSE', id: course.id, title: course.title, credits: course.pricing.payableCredits })
              }
            >
              {t('purchase.buyCourseFor', { price: credits(course.pricing.payableCredits) })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label={t('catalog.locked')}>
      <title>{t('catalog.locked')}</title>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

type Phase = 'confirm' | 'busy' | 'done';

/**
 * Баталгаажуулах цонх: үнэ, үлдэгдэл, "буцаалтгүй" анхааруулга (checkbox заавал). Кредит хүрэлцэхгүй бол
 * цэнэглэх хуудас руу (`/credits?next=…` — цэнэглээд энэ хуудас руу буцна).
 */
function ConfirmDialog({
  target,
  onClose,
  onDone,
  onPriceChanged,
}: {
  target: Target;
  onClose: () => void;
  onDone: () => Promise<void>;
  onPriceChanged: () => Promise<number | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [price, setPrice] = useState(target.credits);
  const [balance, setBalance] = useState<number | null>(null);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const loadBalance = useCallback(() => {
    api<CreditBalanceView>('/credits')
      .then((r) => setBalance(r.data.balance))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.push(withNext('/login', pathname));
        else setMessage(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router, pathname]);

  useEffect(loadBalance, [loadBalance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const insufficient = balance !== null && balance < price;

  async function confirm() {
    setPhase('busy');
    setMessage(null);
    const path = target.kind === 'LESSON' ? `/purchases/lessons/${target.id}` : `/purchases/courses/${target.id}`;
    try {
      const r = await api<PurchaseResult>(path, {
        method: 'POST',
        body: { confirmNoRefund: true, expectedCredits: price },
      });
      setResult(r.data);
      setBalance(r.data.balance);
      setPhase('done');
      await onDone();
    } catch (err) {
      setPhase('confirm');
      if (!(err instanceof ApiRequestError)) return setMessage(t('auth.genericError'));
      if (err.status === 401) return router.push(withNext('/login', pathname));
      if (err.code === 'PRICE_CHANGED') {
        const fresh = await onPriceChanged();
        if (fresh !== null) setPrice(fresh);
        setAgree(false);
        return setMessage(t('purchase.priceChanged'));
      }
      if (err.code === 'INSUFFICIENT_CREDITS') loadBalance();
      setMessage(err.message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'done' && result ? (
          <>
            <h2 id="purchase-title" style={{ margin: 0 }}>
              {t('purchase.success')}
            </h2>
            <p style={{ margin: 0 }}>
              {target.kind === 'LESSON'
                ? t('purchase.successLesson', { title: target.title })
                : t('purchase.successCourse', { title: target.title, count: result.purchase.lessonCount })}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {t('purchase.balanceAfter', { count: formatNumber(result.balance) })}
            </p>
            <div className="modal-actions">
              {target.kind === 'LESSON' && result.purchase.lesson && (
                <Link className="btn" href={`/courses/${result.purchase.course.id}/lessons/${result.purchase.lesson.id}`} onClick={onClose}>
                  {t('purchase.open')}
                </Link>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('purchase.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="purchase-title" style={{ margin: 0 }}>
              {target.kind === 'LESSON' ? t('purchase.confirmLessonTitle') : t('purchase.confirmCourseTitle')}
            </h2>
            <p style={{ margin: 0 }}>
              <strong>{target.title}</strong>
            </p>
            <dl className="purchase-summary">
              <dt>{t('purchase.price')}</dt>
              <dd>{credits(price)}</dd>
              <dt>{t('purchase.balance')}</dt>
              <dd>{balance === null ? '…' : t('credits.creditsCount', { count: formatNumber(balance) })}</dd>
              {balance !== null && !insufficient && (
                <>
                  <dt>{t('purchase.after')}</dt>
                  <dd>{t('credits.creditsCount', { count: formatNumber(balance - price) })}</dd>
                </>
              )}
            </dl>
            {target.kind === 'COURSE' && <p className="muted" style={{ margin: 0 }}>{t('purchase.courseHint')}</p>}

            {insufficient ? (
              <div className="purchase-warning">
                <p style={{ margin: 0 }}>{t('purchase.insufficient', { count: formatNumber(price - (balance ?? 0)) })}</p>
                <Link className="btn" href={withNext('/credits', pathname)}>
                  {t('purchase.topUp')}
                </Link>
              </div>
            ) : (
              <>
                <div className="purchase-warning" role="note">
                  <strong>{t('purchase.noRefundTitle')}</strong>
                  <p style={{ margin: 0 }}>{t('purchase.noRefundBody')}</p>
                </div>
                <label className="checkbox" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>{t('purchase.noRefundConfirm')}</span>
                </label>
              </>
            )}

            {message && <p style={{ color: 'var(--err)', margin: 0 }}>{message}</p>}

            <div className="modal-actions">
              {!insufficient && (
                <button
                  type="button"
                  className="btn"
                  disabled={!agree || balance === null || phase === 'busy'}
                  onClick={() => void confirm()}
                >
                  {phase === 'busy' ? t('purchase.buying') : t('purchase.confirm', { price: credits(price) })}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('purchase.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
