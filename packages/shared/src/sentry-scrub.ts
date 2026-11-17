/**
 * Sentry event-ээс хувийн мэдээлэл (утас, имэйл, token, cookie) арилгана. API болон web хоёулаа ашиглана.
 * Sentry-ийн төрөлд хамааралгүй (ерөнхий object) тул SDK-ийн хувилбараас үл хамаарна.
 */

const REDACTED = '[redacted]';
const MAX_DEPTH = 8;

/** Нэр нь эдгээртэй таарвал утгыг бүхэлд нь нууцална. */
const SENSITIVE_KEY =
  /(phone|e-?mail|token|secret|passw|authorization|cookie|api[-_]?key|otp|signature|credential|jwt|identifier|challenge|session|set-cookie)/i;
const SENSITIVE_EXACT = new Set(['code', 'shortcode', 'smsuri']);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Монгол утас: 8 орон (6-9-өөр эхэлнэ), заримдаа +976 угтвартай. */
const PHONE_RE = /(?<![\w.])(?:\+?976[\s-]?)?[6-9]\d{3}[\s-]?\d{4}(?![\w.])/g;
const BEARER_RE = /\bBearer\s+[\w.~+/=-]+/gi;
const JWT_RE = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g;

export function scrubString(value: string): string {
  return value
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || SENSITIVE_EXACT.has(key.toLowerCase());
}

/** Хэт гүн / циклтэй бүтцийг тойрч, sensitive нэртэй талбарыг нууцалж, string-үүдээс PII арилгана. */
export function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH || seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? REDACTED : scrubValue(v, depth + 1, seen);
  }
  return out;
}

type LooseEvent = Record<string, unknown>;

/**
 * `beforeSend` / `beforeSendTransaction`-д ашиглана. Хэрэглэгчээс зөвхөн `id`-г үлдээнэ;
 * request-ийн cookie, body (`data`)-г хасаж, header, query-г цэвэрлэнэ.
 */
export function scrubSentryEvent<T extends LooseEvent>(event: T): T {
  const e = { ...event } as LooseEvent;

  const user = e.user as LooseEvent | undefined;
  if (user) e.user = typeof user.id === 'string' || typeof user.id === 'number' ? { id: user.id } : undefined;

  const req = e.request as LooseEvent | undefined;
  if (req) {
    const next: LooseEvent = { ...req };
    delete next.cookies;
    delete next.data;
    if (next.headers) next.headers = scrubValue(next.headers);
    if (typeof next.query_string === 'string') next.query_string = REDACTED;
    else if (next.query_string) next.query_string = scrubValue(next.query_string);
    if (typeof next.url === 'string') next.url = scrubString(next.url.split('?')[0] ?? '');
    e.request = next;
  }

  for (const key of ['extra', 'contexts', 'tags', 'breadcrumbs', 'message', 'logentry', 'exception', 'transaction']) {
    if (e[key] !== undefined) e[key] = scrubValue(e[key]);
  }
  return e as T;
}

/**
 * Sentry v11 `dataCollection` — хамгийн хатуу: cookie, header, body, query, DB параметр, local хувьсагч, хэрэглэгчийн мэдээллийг
 * SDK автоматаар цуглуулахгүй. (`beforeSend` дахь `scrubSentryEvent` нь давхар хамгаалалт.)
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} as const;
