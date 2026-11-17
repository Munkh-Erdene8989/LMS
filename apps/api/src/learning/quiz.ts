import type { QuizAnswerInput } from '@lms/shared';
import type { StoredQuiz } from '../catalog/lesson-types';
import { LearningErrors as E } from './errors';

export interface QuizScore {
  correctCount: number;
  questionCount: number;
  /** floor(correct / total × 100) — дээш бөөрөнхийлөхгүй (сертификатын ≥70% босго) */
  scorePercent: number;
  passed: boolean;
  /** Асуултын дарааллаар, хариулаагүй бол хоосон */
  answers: QuizAnswerInput[];
}

/**
 * Quiz-ийн оноо. Асуулт бүр 1 оноо: нэг сонголттой — зөв сонголт; олон сонголттой — зөв сонголтуудыг
 * ЯГ ТАГ (илүү, дутуугүй) сонгосон үед л зөв (хэсэгчилсэн оноогүй). Хариулаагүй асуулт буруу.
 * Байхгүй асуулт/сонголт, давхардал, нэг сонголттой асуултад олон сонголт → 400 `INVALID_ANSWERS`.
 */
export function scoreQuiz(quiz: StoredQuiz, input: QuizAnswerInput[]): QuizScore {
  const byQuestion = new Map(quiz.questions.map((q) => [q.id, q]));
  const given = new Map<string, Set<string>>();
  for (const a of input) {
    const q = byQuestion.get(a.questionId);
    if (!q || given.has(a.questionId)) throw E.invalidAnswers();
    const picked = new Set(a.optionIds);
    if (picked.size !== a.optionIds.length) throw E.invalidAnswers();
    if (!q.multiple && picked.size > 1) throw E.invalidAnswers();
    const valid = new Set(q.options.map((o) => o.id));
    for (const id of picked) if (!valid.has(id)) throw E.invalidAnswers();
    given.set(a.questionId, picked);
  }

  let correctCount = 0;
  for (const q of quiz.questions) {
    const picked = given.get(q.id) ?? new Set<string>();
    const correct = new Set(q.correctOptionIds);
    if (picked.size === correct.size && [...picked].every((id) => correct.has(id))) correctCount++;
  }
  const questionCount = quiz.questions.length;
  const scorePercent = questionCount === 0 ? 0 : Math.floor((correctCount * 100) / questionCount);
  return {
    correctCount,
    questionCount,
    scorePercent,
    passed: scorePercent >= quiz.passPercent,
    answers: quiz.questions.map((q) => ({ questionId: q.id, optionIds: [...(given.get(q.id) ?? [])] })),
  };
}
