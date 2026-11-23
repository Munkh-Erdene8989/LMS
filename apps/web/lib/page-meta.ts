import type { Metadata } from 'next';
import { BRAND } from '@lms/shared';
import { t, type MessageKey } from './i18n';

/** Хуудасны `<title>`: «<гарчиг> — <брэнд>» (catalog/course-ийн generateMetadata-тай ижил хэлбэр). */
export function pageMeta(key: MessageKey): Metadata {
  return { title: `${t(key)} — ${BRAND.name}` };
}
