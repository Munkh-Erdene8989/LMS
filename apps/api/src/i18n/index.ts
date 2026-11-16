import { createTranslator } from '@lms/shared';
import mn from './mn.json';

/** API талын текст (имэйл, мэдэгдэл). UI текст `apps/web/messages`-д. */
export const messages = mn;
export const t = createTranslator(mn);
