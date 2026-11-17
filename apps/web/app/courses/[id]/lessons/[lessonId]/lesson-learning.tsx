'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { LessonLearningState, LessonProgressView, LessonType, QuizAttemptResult, QuizAttemptView, QuizContent } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

/**
 * Хичээлийн явц: нээхэд "сүүлд үзсэн" бүртгэнэ, текст/PDF-д "Дууслаа" товч, quiz бөглөх.
 * Нэвтрээгүй (зөвхөн preview) үед явц бичигдэхгүй — нэвтрэх линк.
 */
export function LessonLearning({ lessonId, type, quiz, loginHref }: { lessonId: string; type: LessonType; quiz: QuizContent | null; loginHref: string }) {
  const [state, setState] = useState<LessonLearningState | null>(null);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<LessonProgressView>(`/learning/lessons/${lessonId}/progress`, { method: 'POST', body: {} })
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
      <p className="muted" style={{ margin: 0 }}>
        <Link href={loginHref}>{t('home.login')}</Link>
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
        {error}
      </p>
    );
  }
  if (!state) return null;

  if (type === 'QUIZ' && quiz) {
    return <QuizPlayer lessonId={lessonId} quiz={quiz} initial={state} />;
  }
  if (type === 'TEXT' || type === 'PDF') {
    return <CompleteButton lessonId={lessonId} progress={state.progress} />;
  }
  return null;
}

function CompleteButton({ lessonId, progress: initial }: { lessonId: string; progress: LessonProgressView }) {
  const [progress, setProgress] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (progress.completed) {
    return <p className="done-mark" style={{ margin: 0 }}>✓ {t('learning.completed')}</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            setProgress((await api<LessonProgressView>(`/learning/lessons/${lessonId}/complete`, { method: 'POST' })).data);
          } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('learning.markComplete')}
      </button>
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
    </div>
  );
}

function QuizPlayer({ lessonId, quiz, initial }: { lessonId: string; quiz: QuizContent; initial: LessonLearningState }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizAttemptView | null>(null);
  const [best, setBest] = useState<number | null>(initial.quiz?.bestScorePercent ?? null);
  const [attempts, setAttempts] = useState<QuizAttemptView[]>(initial.quiz?.attempts ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        {t('quiz.passPercent', { percent: quiz.passPercent })}
        {best !== null && ` · ${t('quiz.best', { percent: best })}`}
      </p>

      {result ? (
        <div className="card" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <strong>{t('quiz.result', { percent: result.scorePercent, correct: result.correctCount, total: result.questionCount })}</strong>
          <span style={{ color: result.passed ? 'var(--ok)' : 'var(--err)' }}>{result.passed ? t('quiz.passed') : t('quiz.failed')}</span>
          <small className="muted">{t('quiz.noAnswersHint')}</small>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setResult(null);
              setSelected({});
            }}
          >
            {t('quiz.retry')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          {quiz.questions.map((q, i) => (
            <fieldset key={q.id} className="quiz-question">
              <legend>
                {i + 1}. {q.text}
              </legend>
              <small className="muted">{q.multiple ? t('quiz.multiple') : t('quiz.single')}</small>
              {q.options.map((o) => (
                <label key={o.id} className="quiz-option">
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
            <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
              {error}
            </p>
          )}
          <button className="btn" disabled={busy} style={{ justifySelf: 'start' }}>
            {busy ? t('quiz.submitting') : t('quiz.submit')}
          </button>
        </form>
      )}

      {attempts.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <strong>{t('quiz.attempts')}</strong>
          <ul style={{ margin: 0 }}>
            {attempts.map((a) => (
              <li key={a.id} style={{ color: a.passed ? 'var(--ok)' : undefined }}>
                {t('quiz.attemptRow', { date: formatDate(a.createdAt), percent: a.scorePercent, correct: a.correctCount, total: a.questionCount })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
