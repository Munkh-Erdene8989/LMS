import { BRAND, lookupMessage, type TranslateParams } from '@lms/shared';
import { messages, t } from '../i18n';

export type NotificationType = keyof typeof messages.notifications;

export interface RenderedNotification {
  title: string;
  body: string;
  emailSubject: string;
}

/** DB-д хадгалсан `type` + `params`-аас translation ашиглан текст үүсгэнэ. */
export function renderNotification(type: string, params: unknown): RenderedNotification {
  const p: TranslateParams = { brand: BRAND.name, ...toParams(params) };
  const get = (field: string) => lookupMessage(messages, `notifications.${type}.${field}`, p);
  const title = get('title') ?? type;
  return { title, body: get('body') ?? '', emailSubject: get('emailSubject') ?? title };
}

export function renderEmail(
  n: RenderedNotification,
  linkUrl: string | null,
): { subject: string; text: string; html: string } {
  const footer = t('email.footer', { brand: BRAND.name });
  const text = [t('email.greeting'), '', n.body, ...(linkUrl ? ['', linkUrl] : []), '', '—', footer].join('\n');
  const button = linkUrl
    ? `<p><a href="${escapeHtml(linkUrl)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(t('email.open'))}</a></p>`
    : '';
  const html = `<!doctype html><html lang="mn"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<h2 style="margin-top:0">${escapeHtml(n.title)}</h2>
<p>${escapeHtml(t('email.greeting'))}</p>
<p>${escapeHtml(n.body)}</p>
${button}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="color:#6b7280;font-size:13px">${escapeHtml(footer)}</p>
</div></body></html>`;
  return { subject: n.emailSubject, text, html };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toParams(params: unknown): TranslateParams {
  if (!params || typeof params !== 'object') return {};
  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).filter(
      (e): e is [string, string | number] => typeof e[1] === 'string' || typeof e[1] === 'number',
    ),
  );
}
