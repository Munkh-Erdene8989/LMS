import type { LessonType } from '@lms/db';
import { AVAILABLE_LESSON_TYPES, PDF_MAX_BYTES } from '@lms/shared';
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

export const LESSON_TYPES: Partial<Record<LessonType, LessonTypeDefinition<unknown, unknown>>> = {
  TEXT: TEXT as LessonTypeDefinition<unknown, unknown>,
  PDF: PDF as LessonTypeDefinition<unknown, unknown>,
};

export function isAvailableType(type: LessonType): boolean {
  return AVAILABLE_LESSON_TYPES.includes(type) && !!LESSON_TYPES[type];
}

export { PDF_MAX_BYTES };
