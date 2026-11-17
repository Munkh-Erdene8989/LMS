'use client';

import { QUIZ_MAX_OPTIONS, QUIZ_MAX_QUESTIONS, type LessonContent, type QuizContentInput } from '@lms/shared';
import { t } from '@/lib/i18n';

type Question = QuizContentInput['questions'][number];

/** API-ийн quiz view (answerKey-тэй) → засварлах оролт (сонголт бүр `correct`). */
export function quizInputFrom(content: LessonContent): QuizContentInput {
  if (content.type !== 'QUIZ') return { passPercent: 70, questions: [] };
  return {
    passPercent: content.passPercent,
    questions: content.questions.map((q) => {
      const correct = content.answerKey?.[q.id] ?? [];
      return {
        id: q.id,
        text: q.text,
        multiple: q.multiple,
        options: q.options.map((o) => ({ id: o.id, text: o.text, correct: correct.includes(o.id) })),
      };
    }),
  };
}

const blankQuestion = (): Question => ({
  text: '',
  multiple: false,
  options: [
    { text: '', correct: false },
    { text: '', correct: false },
  ],
});

/** Багшийн quiz засварлагч: асуулт, сонголт, зөв хариулт, тэнцэх оноо. Хадгалах нь эх формын "Хадгалах" товчоор. */
export function QuizEditor({ value, onChange }: { value: QuizContentInput; onChange: (next: QuizContentInput) => void }) {
  const setQuestion = (i: number, patch: Partial<Question>) =>
    onChange({ ...value, questions: value.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  function setCorrect(qi: number, oi: number, checked: boolean) {
    const q = value.questions[qi]!;
    setQuestion(qi, {
      options: q.options.map((o, j) => (j === oi ? { ...o, correct: checked } : q.multiple ? o : { ...o, correct: false })),
    });
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <strong>{t('quiz.editorTitle')}</strong>
      <label style={{ display: 'grid', gap: 4, maxWidth: 200 }}>
        {t('quiz.editorPass')}
        <input
          className="input"
          type="number"
          min={0}
          max={100}
          step={1}
          value={value.passPercent}
          onChange={(e) => onChange({ ...value, passPercent: Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0))) })}
        />
      </label>

      {value.questions.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('quiz.editorEmpty')}</p>}

      {value.questions.map((q, qi) => (
        <fieldset key={q.id ?? `new-${qi}`} className="quiz-question">
          <legend>{t('quiz.editorQuestion', { n: qi + 1 })}</legend>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('quiz.editorQuestionText')}
            <textarea className="input" rows={2} maxLength={2000} value={q.text} onChange={(e) => setQuestion(qi, { text: e.target.value })} />
          </label>
          <label className="quiz-option">
            <input
              type="checkbox"
              checked={q.multiple}
              onChange={(e) =>
                setQuestion(qi, {
                  multiple: e.target.checked,
                  // Нэг сонголттой болгоход зөвхөн эхний зөвийг үлдээнэ
                  options: e.target.checked
                    ? q.options
                    : q.options.map((o, j) => ({ ...o, correct: o.correct && j === q.options.findIndex((x) => x.correct) })),
                })
              }
            />
            {t('quiz.editorMultiple')}
          </label>
          {q.options.map((o, oi) => (
            <div key={o.id ?? `new-${oi}`} className="quiz-option">
              <input
                type={q.multiple ? 'checkbox' : 'radio'}
                name={`correct-${qi}`}
                checked={o.correct}
                aria-label={t('quiz.editorCorrect')}
                title={t('quiz.editorCorrect')}
                onChange={(e) => setCorrect(qi, oi, e.target.checked)}
              />
              <input
                className="input"
                maxLength={500}
                placeholder={t('quiz.editorOption')}
                aria-label={t('quiz.editorOption')}
                value={o.text}
                onChange={(e) => setQuestion(qi, { options: q.options.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })}
              />
              <button
                type="button"
                className="btn-icon"
                disabled={q.options.length <= 2}
                onClick={() => setQuestion(qi, { options: q.options.filter((_, j) => j !== oi) })}
              >
                {t('quiz.editorRemove')}
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={q.options.length >= QUIZ_MAX_OPTIONS}
              onClick={() => setQuestion(qi, { options: [...q.options, { text: '', correct: false }] })}
            >
              {t('quiz.editorAddOption')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => onChange({ ...value, questions: value.questions.filter((_, j) => j !== qi) })}
            >
              {t('quiz.editorRemove')}
            </button>
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        className="btn btn-ghost"
        style={{ justifySelf: 'start' }}
        disabled={value.questions.length >= QUIZ_MAX_QUESTIONS}
        onClick={() => onChange({ ...value, questions: [...value.questions, blankQuestion()] })}
      >
        {t('quiz.editorAddQuestion')}
      </button>
    </div>
  );
}
