'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  canOpenLesson,
  formatUbDateTime,
  ownsLessonIn,
  type CreditBalanceView,
  type PublicCourseDetail,
  type PublicLessonItem,
  type PurchaseResult,
  type ReferralLinkView,
} from '@lms/shared';
import { api, ApiRequestError, errorText } from '@/lib/client-api';
import { formatCredits, formatNumber, formatPrice } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { withNext } from '@/lib/next-path';
import { Button, LinkButton } from '../ui/button';
import { CreditPill } from '../ui/credit-pill';
import { Dialog, DialogActions } from '../ui/dialog';
import { useToast } from '../ui/toast';
import styles from './courses.module.css';

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
    (lessonId: string) => ownsLessonIn(course.viewer, lessonId),
    [course.viewer],
  );

  return (
    <Ctx.Provider value={{ course, ownsLesson, start: setTarget }}>
      {children}
      {target && (
        <PurchaseDialog
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

/* ---------- Lesson list ---------- */

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Curriculum-ийн мөр: үнэгүй (▶) / авсан (✓) / түгжээтэй (🔒). Түгжээтэй мөрийг дарвал худалдан авах цонх. */
export function LessonRow({ lesson }: { lesson: PublicLessonItem }) {
  const { course, ownsLesson, start } = usePurchase();
  const href = `/courses/${course.id}/lessons/${lesson.id}`;
  const owned = ownsLesson(lesson.id);
  const open = canOpenLesson(course.viewer, lesson.id);
  const sub = [
    t(`course.type${lesson.type}` as MessageKey),
    lesson.live?.startsAt ? formatUbDateTime(lesson.live.startsAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const buy = () => start({ kind: 'LESSON', id: lesson.id, title: lesson.title, credits: lesson.priceCredits });

  const text = (
    <span className={styles.lessonText}>
      <span className={styles.lessonTitle}>{lesson.title}</span>
      <span className={styles.lessonSub}>{sub}</span>
    </span>
  );

  if (open) {
    return (
      <li>
        <Link className={styles.lesson} href={href}>
          <span className={`${styles.lessonIcon} ${owned ? styles.lessonIconOwned : styles.lessonIconFree}`}>
            {owned ? <CheckIcon /> : <PlayIcon />}
          </span>
          {text}
          <span className={styles.lessonEnd}>
            <span className={styles.statusOk}>{owned ? t('courses.lessonOwned') : t('purchase.open')}</span>
          </span>
        </Link>
      </li>
    );
  }

  if (lesson.isFreePreview) {
    return (
      <li className={styles.lessonWithBuy}>
        <Link className={styles.lesson} href={href}>
          <span className={`${styles.lessonIcon} ${styles.lessonIconFree}`}>
            <PlayIcon />
          </span>
          {text}
          <span className={styles.lessonEnd}>
            <span className={styles.statusFree}>{t('courses.lessonFree')}</span>
          </span>
        </Link>
        {lesson.priceCredits > 0 && (
          <Button variant="ghost" size="sm" onClick={buy}>
            {t('purchase.buyLesson', { price: formatPrice(lesson.priceCredits) })}
          </Button>
        )}
      </li>
    );
  }

  return (
    <li>
      <button type="button" className={styles.lesson} onClick={buy}>
        <span className={styles.lessonIcon}>
          <LockIcon />
        </span>
        {text}
        <span className={styles.lessonEnd}>
          <span>{formatPrice(lesson.priceCredits)}</span>
          <span className={styles.buy}>{t('courses.lessonBuy')}</span>
        </span>
      </button>
    </li>
  );
}

/* ---------- Buybox ---------- */

function PriceFigure({ credits }: { credits: number }) {
  return credits === 0 ? (
    <>{t('ui.free')}</>
  ) : (
    <>
      {formatNumber(credits)}
      <small>{t('courses.creditUnit')}</small>
    </>
  );
}

/** Курсийн үнийн хайрцаг: хувийн үнэ (өмнө төлсөн хасагдсан) + бүтнээр авах. */
export function CoursePriceBox() {
  const { course, start } = usePurchase();
  const { pricing, viewer } = course;
  const forSale = pricing.listCredits > 0;

  return (
    <aside className={styles.buybox} aria-label={t('courses.buybox')}>
      <span className={styles.priceLabel}>{t('catalog.fullPrice')}</span>
      {viewer?.ownsCourse ? (
        <p className={styles.price}>{t('purchase.ownedCourse')}</p>
      ) : (
        <p className={styles.price}>
          <PriceFigure credits={pricing.payableCredits} />
        </p>
      )}
      {!viewer?.ownsCourse && pricing.alreadySpentCredits > 0 && (
        <p className={styles.note}>
          {t('purchase.deducted', { list: formatNumber(pricing.listCredits), spent: formatNumber(pricing.alreadySpentCredits) })}
        </p>
      )}
      {pricing.lessonsTotalCredits > pricing.listCredits && (
        <p className={styles.note}>{t('catalog.lessonsTotal', { count: formatNumber(pricing.lessonsTotalCredits) })}</p>
      )}
      {viewer?.canViewAll ? (
        <p className={styles.note}>{viewer.isTeacher ? t('purchase.yourCourse') : t('purchase.adminAccess')}</p>
      ) : viewer?.orgAccess ? (
        <p className={styles.note}>{t('purchase.orgAccess')}</p>
      ) : viewer?.ownsCourse ? (
        <p className={styles.note}>{t('purchase.ownedCourseHint')}</p>
      ) : forSale ? (
        <>
          <Button
            className={styles.buyFull}
            onClick={() => start({ kind: 'COURSE', id: course.id, title: course.title, credits: pricing.payableCredits })}
          >
            {t('purchase.buyCourse')}
          </Button>
          <p className={styles.note}>{t('purchase.courseHint')}</p>
        </>
      ) : (
        <p className={styles.note}>{t('purchase.notForSale')}</p>
      )}
    </aside>
  );
}

/** Mobile-д доод sticky бар (≤980px): үнэ + «Курс авах». Зөвхөн худалдаж авах боломжтой үед. */
export function CourseMobileBar() {
  const { course, start } = usePurchase();
  const { pricing, viewer } = course;
  if (viewer?.canViewAll || viewer?.orgAccess || viewer?.ownsCourse || pricing.listCredits <= 0) return null;
  return (
    <div className={styles.mobileBar} role="region" aria-label={t('courses.buyBar')}>
      <span className={styles.mobilePrice}>{formatPrice(pricing.payableCredits)}</span>
      <Button onClick={() => start({ kind: 'COURSE', id: course.id, title: course.title, credits: pricing.payableCredits })}>
        {t('purchase.buyCourse')}
      </Button>
    </div>
  );
}

/** Түгжээтэй lesson-ы хуудсанд: тайлбар + худалдаж авах товч. */
export function LockedLesson({ lesson }: { lesson: PublicLessonItem }) {
  const { course, start } = usePurchase();
  const isTeacher = !!course.viewer?.isTeacher;
  return (
    <div className={`card ${styles.locked}`}>
      <h1 className={styles.lockedTitle}>{lesson.title}</h1>
      <p className="muted">{t('purchase.lockedHint')}</p>
      {!isTeacher && (
        <div className={styles.row}>
          <Button onClick={() => start({ kind: 'LESSON', id: lesson.id, title: lesson.title, credits: lesson.priceCredits })}>
            {t('purchase.buyLesson', { price: formatPrice(lesson.priceCredits) })}
          </Button>
          {course.pricing.listCredits > 0 && !course.viewer?.ownsCourse && (
            <Button
              variant="secondary"
              onClick={() => start({ kind: 'COURSE', id: course.id, title: course.title, credits: course.pricing.payableCredits })}
            >
              {t('purchase.buyCourseFor', { price: formatPrice(course.pricing.payableCredits) })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Purchase dialog ---------- */

type Phase = 'confirm' | 'busy' | 'done';

/** Худалдан авсны дараа pill-ийг өмнөх үлдэгдлээс шинэ рүү шилжүүлж bump хийлгэнэ. */
function BalanceBump({ from, to }: { from: number; to: number }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const id = setTimeout(() => setShown(to), 350);
    return () => clearTimeout(id);
  }, [to]);
  return <CreditPill balance={shown} />;
}

/**
 * Баталгаажуулах цонх (`Dialog`: focus trap, Esc, scrim): үнэ, үлдэгдэл, "буцаалтгүй" анхааруулга (checkbox заавал).
 * Кредит хүрэлцэхгүй бол цэнэглэх хуудас руу (`/credits?next=…` — цэнэглээд энэ хуудас руу буцна).
 */
function PurchaseDialog({
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
  const { toast } = useToast();
  const [price, setPrice] = useState(target.credits);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number | null>(null);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const loadBalance = useCallback(() => {
    api<CreditBalanceView>('/credits')
      .then((r) => setBalance(r.data.balance))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.push(withNext('/login', pathname));
        else setMessage(errorText(err));
      });
  }, [router, pathname]);

  useEffect(loadBalance, [loadBalance]);

  const insufficient = balance !== null && balance < price;
  const busy = phase === 'busy';

  async function confirm() {
    setPhase('busy');
    setMessage(null);
    const path = target.kind === 'LESSON' ? `/purchases/lessons/${target.id}` : `/purchases/courses/${target.id}`;
    try {
      const r = await api<PurchaseResult>(path, {
        method: 'POST',
        body: { confirmNoRefund: true, expectedCredits: price },
      });
      setBalanceBefore(balance ?? r.data.balance + price);
      setResult(r.data);
      setBalance(r.data.balance);
      setPhase('done');
      toast(t('courses.bought', { title: target.title }));
      window.dispatchEvent(new Event('credits:changed'));
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

  const done = phase === 'done' && result;
  const guardedClose = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog
      open
      onClose={guardedClose}
      closeOnScrim={!busy}
      title={
        done
          ? t('purchase.success')
          : target.kind === 'LESSON'
            ? t('purchase.confirmLessonTitle')
            : t('purchase.confirmCourseTitle')
      }
      description={
        done
          ? target.kind === 'LESSON'
            ? t('purchase.successLesson', { title: target.title })
            : t('purchase.successCourse', { title: target.title, count: result.purchase.lessonCount })
          : target.title
      }
    >
      {done ? (
        <>
          <div className={styles.doneBalance} role="status">
            <span>{t('purchase.balanceAfter', { count: formatNumber(result.balance) })}</span>
            <BalanceBump from={balanceBefore ?? result.balance} to={result.balance} />
          </div>
          <DialogActions>
            {target.kind === 'LESSON' && result.purchase.lesson && (
              <LinkButton href={`/courses/${result.purchase.course.id}/lessons/${result.purchase.lesson.id}`} onClick={onClose}>
                {t('purchase.open')}
              </LinkButton>
            )}
            <Button variant="secondary" onClick={onClose}>
              {t('purchase.close')}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <dl className={styles.summary}>
            <dt>{t('purchase.price')}</dt>
            <dd>{formatPrice(price)}</dd>
            <dt>{t('purchase.balance')}</dt>
            <dd>{balance === null ? '…' : formatCredits(balance)}</dd>
            {balance !== null && !insufficient && (
              <>
                <dt className={styles.summaryTotal}>{t('purchase.after')}</dt>
                <dd className={styles.summaryTotal}>{formatCredits(balance - price)}</dd>
              </>
            )}
          </dl>
          {target.kind === 'COURSE' && <p className={styles.note}>{t('purchase.courseHint')}</p>}

          {insufficient ? (
            <div className={styles.warning}>
              <p>{t('purchase.insufficient', { count: formatNumber(price - (balance ?? 0)) })}</p>
            </div>
          ) : (
            <>
              <div className={styles.warning} role="note">
                <strong>{t('purchase.noRefundTitle')}</strong>
                <p>{t('purchase.noRefundBody')}</p>
              </div>
              <label className={styles.agree}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>{t('purchase.noRefundConfirm')}</span>
              </label>
            </>
          )}

          {message && (
            <p className={styles.error} role="alert">
              {message}
            </p>
          )}

          <DialogActions>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('purchase.cancel')}
            </Button>
            {insufficient ? (
              <LinkButton href={withNext('/credits', pathname)}>{t('purchase.topUp')}</LinkButton>
            ) : (
              <Button
                loading={busy}
                loadingLabel={t('purchase.buying')}
                disabled={!agree || balance === null}
                onClick={() => void confirm()}
              >
                {t('purchase.confirm', { price: formatPrice(price) })}
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

/**
 * Курсийн багшид (өөрт нь) харагдана: "энэ курсийн referral линк хуулах". Багшийн referral линк
 * (`/teacher/referral`-ийн ижил `GET /teacher/referral`) + `?next=/courses/<id>`.
 */
export function CourseReferralCopy() {
  const { course } = usePurchase();
  const isTeacher = !!course.viewer?.isTeacher;
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  if (!isTeacher) return null;

  async function copy() {
    try {
      const r = await api<ReferralLinkView>('/teacher/referral');
      await navigator.clipboard.writeText(`${window.location.origin}${r.data.path}?next=/courses/${course.id}`);
      setState('copied');
      setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('error');
    }
  }

  return (
    <div className={styles.referral}>
      <Button size="sm" onClick={() => void copy()}>
        {t('referral.copyCourse')}
      </Button>
      <small className="muted" role="status" aria-live="polite">
        {state === 'copied' ? t('referral.courseCopied') : state === 'error' ? t('referral.copyFailed') : t('referral.courseCopyHint')}
      </small>
    </div>
  );
}
