import { createTranslator, type MessageKeys } from '@lms/shared';
import mn from '../messages/mn.json';

/**
 * Бүх UI текст translation файлаас. Одоогоор зөвхөн монгол; англи хэл нэмэхэд
 * `messages/en.json` нэмж, locale сонголтыг энд холбоно.
 */
export type MessageKey = MessageKeys<typeof mn>;

export const t = createTranslator(mn);
