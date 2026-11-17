import { randomUUID } from 'node:crypto';
import type { LessonType } from '@lms/db';
import {
  AVAILABLE_LESSON_TYPES,
  LIVE_DURATION_MAX,
  LIVE_DURATION_MIN,
  PDF_MAX_BYTES,
  QUIZ_DEFAULT_PASS_PERCENT,
  QUIZ_MAX_OPTIONS,
  QUIZ_MAX_QUESTIONS,
  ubLocalToIso,
} from '@lms/shared';
import { z } from 'zod';

/**
 * Lesson-ы төрөл бүрийн тодорхойлолт: засах үед ирэх контентын schema, хадгалах хэлбэр,
 * илгээхэд бэлэн эсэх. Шинэ төрөл (video, quiz…) нэмэхэд энд entry нэмнэ.
 */
export interface LessonTypeDefinition<Stored, Input> {
  /** `PATCH /teacher/lessons/:id { content }` */
  input: z.ZodType<Input, z.ZodTypeDef, unknown>;
  empty: Stored;
  /** Шалгуулахаар илгээхэд дутуу зүйлс (монгол тайлбар) */
  problems(content: Stored): string[];
}

export interface TextContent {
  markdown: string;
}

export interface PdfContent {
  fileKey: string | null;
  fileName: string | null;
  size: number | null;
}

/**
 * Live хичээл (ticket 14). `startsAt` ISO (UTC). Нийтлэгдсэн (APPROVED) ч засагдана — хуваарь, линк
 * ажиллагааны мэдээлэл тул (`CourseAuthoringService.updateLesson`). Линкийг хэн харах: `toContent`.
 */
export interface LiveContent {
  startsAt: string | null;
  durationMinutes: number | null;
  meetingUrl: string | null;
}

/** Бичлэг болгон хөрвүүлсэн live (ticket 10 Mux бичлэг нэмнэ). */
export interface VideoContent {
  fromLive?: { startsAt: string; durationMinutes: number };
}

const TEXT: LessonTypeDefinition<TextContent, TextContent> = {
  input: z.object({ markdown: z.string().max(200_000) }),
  empty: { markdown: '' },
  problems: (c) => (c.markdown.trim() ? [] : ['Текст хоосон байна']),
};

/** PDF-ийн контентыг upload-ын дараа `fileKey`-ээр тогтооно (API storage-аас шалгана). */
const PDF: LessonTypeDefinition<PdfContent, { fileKey: string; fileName: string }> = {
  input: z.object({ fileKey: z.string().min(1).max(300), fileName: z.string().trim().min(1).max(200) }),
  empty: { fileKey: null, fileName: null, size: null },
  problems: (c) => (c.fileKey ? [] : ['PDF файл оруулаагүй']),
};

/**
 * Quiz-ийн хадгалах хэлбэр (`lessons.content`). Зөв хариулт `correctOptionIds`-д — learner-т
 * `course.view.ts`-ийн `toContent` (revealAnswers = false) үүнийг хэзээ ч гаргахгүй.
 */
export interface StoredQuiz {
  passPercent: number;
  questions: {
    id: string;
    text: string;
    multiple: boolean;
    options: { id: string; text: string }[];
    correctOptionIds: string[];
  }[];
}

const QuizInput = z
  .object({
    passPercent: z.number().int().min(0).max(100),
    questions: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          text: z.string().trim().max(2000),
          multiple: z.boolean(),
          options: z
            .array(z.object({ id: z.string().uuid().optional(), text: z.string().trim().max(500), correct: z.boolean() }))
            .max(QUIZ_MAX_OPTIONS),
        }),
      )
      .max(QUIZ_MAX_QUESTIONS),
  })
  .strict()
  .transform((input): StoredQuiz => {
    // Ирсэн id-г хадгална (засварлахад тогтвортой), давхардсан/байхгүй бол шинээр.
    const seen = new Set<string>();
    const fresh = (id?: string) => {
      const value = id && !seen.has(id) ? id : randomUUID();
      seen.add(value);
      return value;
    };
    return {
      passPercent: input.passPercent,
      questions: input.questions.map((q) => {
        const qid = fresh(q.id);
        const options = q.options.map((o) => ({ id: fresh(o.id), text: o.text, correct: o.correct }));
        return {
          id: qid,
          text: q.text,
          multiple: q.multiple,
          options: options.map(({ id, text }) => ({ id, text })),
          correctOptionIds: options.filter((o) => o.correct).map((o) => o.id),
        };
      }),
    };
  });

const QUIZ: LessonTypeDefinition<StoredQuiz, StoredQuiz> = {
  input: QuizInput,
  empty: { passPercent: QUIZ_DEFAULT_PASS_PERCENT, questions: [] },
  problems: (c) => {
    const questions = c.questions ?? [];
    if (questions.length === 0) return ['Quiz-д асуулт алга'];
    const problems: string[] = [];
    questions.forEach((q, i) => {
      const n = `${i + 1}-р асуулт`;
      if (!q.text.trim()) problems.push(`${n}: асуулт хоосон`);
      if (q.options.length < 2) problems.push(`${n}: дор хаяж 2 сонголт`);
      if (q.options.some((o) => !o.text.trim())) problems.push(`${n}: хоосон сонголт`);
      if (q.correctOptionIds.length === 0) problems.push(`${n}: зөв хариулт сонгоогүй`);
      else if (!q.multiple && q.correctOptionIds.length > 1) problems.push(`${n}: нэг сонголттой асуултад нэг л зөв хариулт`);
    });
    return problems;
  },
};

/**
 * `startsAt`: офсеттэй ISO (`2026-12-01T19:00:00+08:00`, `…Z`) эсвэл офсетгүй `YYYY-MM-DDTHH:mm` —
 * сүүлийнх нь Улаанбаатарын цаг гэж тооцогдоно.
 */
const liveStartsAt = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)
      ? ubLocalToIso(v)
      : z.string().datetime({ offset: true }).safeParse(v).success
        ? new Date(v).toISOString()
        : null;
    if (!iso) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Эхлэх цаг буруу байна' });
    return iso ?? '';
  });

const LIVE: LessonTypeDefinition<LiveContent, Required<{ [K in keyof LiveContent]: NonNullable<LiveContent[K]> }>> = {
  input: z.object({
    startsAt: liveStartsAt,
    durationMinutes: z
      .number({ message: 'Үргэлжлэх хугацаа (минут) оруулна уу' })
      .int()
      .min(LIVE_DURATION_MIN, `Үргэлжлэх хугацаа ${LIVE_DURATION_MIN}–${LIVE_DURATION_MAX} минут байна`)
      .max(LIVE_DURATION_MAX, `Үргэлжлэх хугацаа ${LIVE_DURATION_MIN}–${LIVE_DURATION_MAX} минут байна`),
    meetingUrl: z
      .string()
      .trim()
      .max(500)
      .url('Линк буруу байна')
      .refine((u) => u.startsWith('https://'), 'Линк https://-ээр эхлэх ёстой (Zoom, Google Meet)'),
  }),
  empty: { startsAt: null, durationMinutes: null, meetingUrl: null },
  problems: (c) => {
    const problems: string[] = [];
    if (!c.startsAt) problems.push('Эхлэх цаг оруулаагүй');
    if (!c.durationMinutes) problems.push('Үргэлжлэх хугацаа оруулаагүй');
    if (!c.meetingUrl) problems.push('Zoom/Meet линк оруулаагүй');
    if (c.startsAt && new Date(c.startsAt).getTime() <= Date.now()) problems.push('Эхлэх цаг өнгөрсөн байна');
    return problems;
  },
};

export const LESSON_TYPES: Partial<Record<LessonType, LessonTypeDefinition<unknown, unknown>>> = {
  TEXT: TEXT as LessonTypeDefinition<unknown, unknown>,
  PDF: PDF as LessonTypeDefinition<unknown, unknown>,
  QUIZ: QUIZ as LessonTypeDefinition<unknown, unknown>,
  LIVE: LIVE as LessonTypeDefinition<unknown, unknown>,
};

export function isAvailableType(type: LessonType): boolean {
  return AVAILABLE_LESSON_TYPES.includes(type) && !!LESSON_TYPES[type];
}

export { PDF_MAX_BYTES };
