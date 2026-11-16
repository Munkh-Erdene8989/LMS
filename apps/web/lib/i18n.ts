import mn from '../messages/mn.json';

/**
 * Бүх UI текст translation файлаас. Одоогоор зөвхөн монгол; англи хэл нэмэхэд
 * `messages/en.json` нэмж, locale сонголтыг энд холбоно.
 */
type Messages = typeof mn;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], mn);
  if (typeof value !== 'string') return key;
  return params ? value.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : value;
}
