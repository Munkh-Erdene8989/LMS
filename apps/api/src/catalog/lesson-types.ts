import type { LessonType } from '@lms/db';
import { AVAILABLE_LESSON_TYPES, LIVE_DURATION_MAX, LIVE_DURATION_MIN, PDF_MAX_BYTES, ubLocalToIso } from '@lms/shared';
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
  LIVE: LIVE as LessonTypeDefinition<unknown, unknown>,
};

export function isAvailableType(type: LessonType): boolean {
  return AVAILABLE_LESSON_TYPES.includes(type) && !!LESSON_TYPES[type];
}

export { PDF_MAX_BYTES };
