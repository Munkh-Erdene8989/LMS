/**
 * Translation файлаас текст авах туслах. Web (UI) болон API (имэйл, мэдэгдэл) хоёулаа ашиглана.
 * Key-үүд translation JSON-оос төрлөөр шалгагдана: `t('home.title')`.
 */
export type MessageTree = { [key: string]: string | MessageTree };

export type MessageKeys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : MessageKeys<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslateParams = Record<string, string | number>;

export function createTranslator<M extends MessageTree>(messages: M) {
  return function t(key: MessageKeys<M>, params?: TranslateParams): string {
    const value = lookup(messages, key);
    if (typeof value !== 'string') return key;
    return params ? interpolate(value, params) : value;
  };
}

/** Төрөлгүй (динамик) key-ээр хайх — жишээ нь DB-д хадгалсан мэдэгдлийн төрөл. Олдохгүй бол undefined. */
export function lookupMessage(messages: MessageTree, key: string, params?: TranslateParams): string | undefined {
  const value = lookup(messages, key);
  if (typeof value !== 'string') return undefined;
  return params ? interpolate(value, params) : value;
}

function lookup(messages: MessageTree, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as MessageTree)[part] : undefined),
    messages,
  );
}

function interpolate(value: string, params: TranslateParams): string {
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
