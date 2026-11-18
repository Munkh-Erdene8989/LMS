'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  formatUbDateTime,
  QUIZ_ATTEMPTS_PER_DAY,
  type LessonLearningState,
  type LessonProgressView,
  type LessonType,
  type QuizAttemptResult,
  type QuizAttemptView,
  type QuizContent,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { CheckIcon } from '../../../../learning/icons';
import { Button, LinkButton } from '../../../../ui/button';
import { useToast } from '../../../../ui/toast';
import { AssignmentPanel } from './assignment-ui';
import { LESSON_PROGRESS_EVENT } from './lesson-frame';
import styles from './lesson.module.css';

/** Sidebar / дээд мөрийн ахицыг дахин уншуулна. */
const notifyProgress = () => window.dispatchEvent(new Event(LESSON_PROGRESS_EVENT));

/**
 * Хичээлийн явц: нээхэд "сүүлд үзсэн" бүртгэнэ, текст/PDF-д "Дууслаа" товч, quiz бөглөх, даалгавар илгээх.
 * Видеоны үзсэн хувийг тоглуулагч (`VideoPlayer`) өөрөө илгээнэ — энд зөвхөн дууссан эсэх.
 * Нэвтрээгүй (зөвхөн preview) үед явц бичигдэхгүй — нэвтрэх линк.
 */
export function LessonLearning({
  lessonId,
  type,
  quiz,
  loginHref,
}: {
  lessonId: string;
  type: LessonType;
  quiz: QuizContent | null;
  loginHref: string;
}) {
  const [state, setState] = useState<LessonLearningState | null>(null);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // "Сүүлд үзсэн" бүртгэл нь туслах үйлдэл: нэвтрээгүй (401) биш бол алдааг үл тооно, төлөвийг үргэлжлүүлэн уншина.
    api<LessonProgressView>(`/learning/lessons/${lessonId}/progress`, {
      method: 'POST',
      body: {},
    })
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) throw err;
      })
      .then(() => api<LessonLearningState>(`/learning/lessons/${lessonId}`))
      .then((r) => alive && setState(r.data))
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiRequestError && err.status === 401) setGuest(true);
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
    return () => {
      alive = false;
    };
  }, [lessonId]);

  if (guest) {
    return (
      <div className={styles.guest}>
        <span>{t('learningUi.guestHint')}</span>
        <LinkButton href={loginHref} size="sm">
          {t('home.login')}
        </LinkButton>
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    );
  }
  if (!state) return null;

  if (type === 'QUIZ' && quiz) {
    return <QuizPlayer lessonId={lessonId} quiz={quiz} initial={state} />;
  }
  if (type === 'ASSIGNMENT' && state.assignment) {
    // Анхны илгээлтээр lesson дуусна — төлөвийг панель өөрөө харуулна
    return <AssignmentPanel lessonId={lessonId} initial={state.assignment} />;
  }
  if (type === 'TEXT' || type === 'PDF') {
    return <CompleteButton lessonId={lessonId} progress={state.progress} />;
  }
  if (type === 'VIDEO' && state.progress.completed) {
    return <DoneMark />;
  }
  return null;
}

function DoneMark() {
  return (
    <p className={styles.done}>
      <CheckIcon />
      {t('learning.completed')}
    </p>
  );
}

function CompleteButton({ lessonId, progress: initial }: { lessonId: string; progress: LessonProgressView }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (progress.completed) return <DoneMark />;

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      setProgress((await api<LessonProgressView>(`/learning/lessons/${lessonId}/complete`, { method: 'POST' })).data);
      toast(t('learning.markedComplete'));
      notifyProgress();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.learning}>
      <div>
        <Button loading={busy} loadingLabel={t('learningUi.saving')} onClick={() => void complete()}>
          {t('learning.markComplete')}
        </Button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function QuizPlayer({ lessonId, quiz, initial }: { lessonId: string; quiz: QuizContent; initial: LessonLearningState }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizAttemptView | null>(null);
  const [best, setBest] = useState<number | null>(initial.quiz?.bestScorePercent ?? null);
  const [attempts, setAttempts] = useState<QuizAttemptView[]>(initial.quiz?.attempts ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Хурдны хязгаар (API: 30 сек хүлээлт, 24 цагт 10 оролдлого) — дараагийн боломжит цаг хүртэл товч идэвхгүй.
  const [nextAt, setNextAt] = useState<string | null>(initial.quiz?.nextAttemptAt ?? null);
  const [now, setNow] = useState(() => Date.now());
  const waitMs = nextAt ? new Date(nextAt).getTime() - now : 0;
  const limited = waitMs > 0;

  useEffect(() => {
    if (!limited) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [limited]);

  function toggle(questionId: string, optionId: string, multiple: boolean) {
    setSelected((prev) => {
      const cur = prev[questionId] ?? [];
      const next = multiple ? (cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId]) : [optionId];
      return { ...prev, [questionId]: next };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const answers = Object.entries(selected).map(([questionId, optionIds]) => ({ questionId, optionIds }));
      const r = (await api<QuizAttemptResult>(`/learning/lessons/${lessonId}/quiz-attempts`, { method: 'POST', body: { answers } })).data;
      setResult(r.attempt);
      setBest(r.quiz.bestScorePercent);
      setAttempts(r.quiz.attempts);
      setNextAt(r.quiz.nextAttemptAt);
      setNow(Date.now());
      if (r.attempt.passed) toast(t('quiz.passed'));
      notifyProgress();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'QUIZ_RATE_LIMITED') {
        // Хязгаарын цагийг серверээс шинэчилнэ — товч өөрөө идэвхгүй болж, хүлээх хугацаа харагдана.
        const fresh = await api<LessonLearningState>(`/learning/lessons/${lessonId}`).catch(() => null);
        if (fresh?.data.quiz) {
          setNextAt(fresh.data.quiz.nextAttemptAt);
          setNow(Date.now());
        }
      }
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.quiz}>
      <p className={styles.meta}>
        {t('quiz.passPercent', { percent: quiz.passPercent })}
        {best !== null && ` · ${t('quiz.best', { percent: best })}`}
      </p>

      {result ? (
        <div className={styles.result} role="status">
          <strong>
            {t('quiz.result', {
              percent: result.scorePercent,
              correct: result.correctCount,
              total: result.questionCount,
            })}
          </strong>
          <span className={result.passed ? styles.pass : styles.fail}>{result.passed ? t('quiz.passed') : t('quiz.failed')}</span>
          <p className={styles.meta}>{t('quiz.noAnswersHint')}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setSelected({});
            }}
          >
            {t('quiz.retry')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className={styles.quiz}>
          {quiz.questions.map((q, i) => (
            <fieldset key={q.id} className={styles.question}>
              <legend>
                {i + 1}. {q.text}
              </legend>
              <small className={styles.meta}>{q.multiple ? t('quiz.multiple') : t('quiz.single')}</small>
              {q.options.map((o) => (
                <label key={o.id} className={styles.option}>
                  <input
                    type={q.multiple ? 'checkbox' : 'radio'}
                    name={q.id}
                    checked={(selected[q.id] ?? []).includes(o.id)}
                    onChange={() => toggle(q.id, o.id, q.multiple)}
                  />
                  {o.text}
                </label>
              ))}
            </fieldset>
          ))}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {limited && nextAt && (
            <p className={styles.meta} role="status">
              {waitMs <= 60_000
                ? t('quiz.rateLimitedSeconds', {
                    seconds: Math.ceil(waitMs / 1000),
                  })
                : t('quiz.rateLimitedUntil', {
                    max: QUIZ_ATTEMPTS_PER_DAY,
                    time: formatUbDateTime(nextAt),
                  })}
            </p>
          )}
          <div>
            <Button type="submit" loading={busy} loadingLabel={t('quiz.submitting')} disabled={limited}>
              {t('quiz.submit')}
            </Button>
          </div>
        </form>
      )}

      {attempts.length > 0 && (
        <div className={styles.attempts}>
          <strong>{t('quiz.attempts')}</strong>
          <ul>
            {attempts.map((a) => (
              <li key={a.id} className={a.passed ? styles.passed : undefined}>
                {t('quiz.attemptRow', {
                  date: formatDate(a.createdAt),
                  percent: a.scorePercent,
                  correct: a.correctCount,
                  total: a.questionCount,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
