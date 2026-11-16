/**
 * QPay merchant API v2 adapter (https://developer.qpay.mn/mn/docs/merchant?version=2.0.0).
 *
 * Дүрэм: callback-ийн body-д хэзээ ч итгэхгүй — төлбөрийн төлөвийг зөвхөн `checkInvoice()`
 * (`POST /v2/payment/check`)-ээр шалгана. Модулиуд `QPAY` token-оор энэ interface-ийг авна.
 */
export interface QPayDeeplink {
  name: string;
  description: string;
  logo: string;
  link: string;
}

export interface QPayInvoiceInput {
  /** Манай талын давтагдашгүй дугаар (Payment.id) */
  senderInvoiceNo: string;
  receiverCode: string;
  description: string;
  amountMnt: number;
  callbackUrl: string;
}

export interface QPayInvoice {
  invoiceId: string;
  qrText: string;
  /** Base64 PNG (data: угтваргүй) */
  qrImage: string;
  shortUrl: string | null;
  urls: QPayDeeplink[];
}

export interface QPayPaymentRow {
  paymentId: string;
  /** `PAID` | `NEW` | `FAILED` | `REFUNDED` ... */
  status: string;
  amountMnt: number;
}

export interface QPayCheckResult {
  /** Төлөгдсөн (`PAID`) мөрүүдийн нийлбэр */
  paidAmountMnt: number;
  rows: QPayPaymentRow[];
}

export interface QPayAdapter {
  createInvoice(input: QPayInvoiceInput): Promise<QPayInvoice>;
  checkInvoice(invoiceId: string): Promise<QPayCheckResult>;
}

export const QPAY = Symbol('QPAY');

export class QPayError extends Error {}

const TIMEOUT_MS = 15_000;
/** Хугацаа дуусахаас өмнө токеныг шинэчлэх зай */
const TOKEN_LEEWAY_MS = 60_000;

interface TokenState {
  accessToken: string;
  refreshToken: string | null;
  /** ms epoch */
  expiresAt: number;
  refreshExpiresAt: number;
}

export class HttpQPayAdapter implements QPayAdapter {
  private token: TokenState | null = null;
  private pendingAuth: Promise<string> | null = null;

  constructor(
    private readonly opts: { clientId: string; clientSecret: string; invoiceCode: string; baseUrl: string },
  ) {}

  async createInvoice(input: QPayInvoiceInput): Promise<QPayInvoice> {
    const body = (await this.authed('POST', '/v2/invoice', {
      invoice_code: this.opts.invoiceCode,
      sender_invoice_no: input.senderInvoiceNo,
      invoice_receiver_code: input.receiverCode,
      invoice_description: input.description,
      amount: input.amountMnt,
      callback_url: input.callbackUrl,
    })) as {
      invoice_id?: string;
      qr_text?: string;
      qr_image?: string;
      qPay_shortUrl?: string;
      urls?: QPayDeeplink[];
    };
    if (!body.invoice_id || !body.qr_text) throw new QPayError('QPay /v2/invoice: invoice_id алга');
    return {
      invoiceId: body.invoice_id,
      qrText: body.qr_text,
      qrImage: body.qr_image ?? '',
      shortUrl: body.qPay_shortUrl ?? null,
      urls: Array.isArray(body.urls) ? body.urls : [],
    };
  }

  async checkInvoice(invoiceId: string): Promise<QPayCheckResult> {
    const body = (await this.authed('POST', '/v2/payment/check', {
      object_type: 'INVOICE',
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    })) as {
      count?: number;
      paid_amount?: number | string;
      rows?: { payment_id?: string; payment_status?: string; payment_amount?: number | string }[];
    };
    const rows: QPayPaymentRow[] = (body.rows ?? []).map((r) => ({
      paymentId: String(r.payment_id ?? ''),
      status: String(r.payment_status ?? ''),
      amountMnt: toInt(r.payment_amount),
    }));
    const paidAmountMnt = rows.filter((r) => r.status === 'PAID').reduce((sum, r) => sum + r.amountMnt, 0);
    return { paidAmountMnt, rows };
  }

  /** 401/403 үед токеныг шинээр авч нэг л удаа давтана (QPay-ийн зөвлөмж). */
  private async authed(method: string, path: string, json: unknown): Promise<unknown> {
    let res = await this.send(method, path, json, await this.accessToken());
    if (res.status === 401 || res.status === 403) {
      this.token = null;
      res = await this.send(method, path, json, await this.accessToken());
    }
    if (!res.ok) throw new QPayError(`QPay ${method} ${path} ${res.status}: ${await safeText(res)}`);
    return res.json();
  }

  private send(method: string, path: string, json: unknown, token: string): Promise<Response> {
    return fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt - TOKEN_LEEWAY_MS > now) return Promise.resolve(this.token.accessToken);
    // Зэрэг ирсэн хүсэлтүүд нэг auth-ийг хүлээнэ.
    this.pendingAuth ??= this.obtainToken().finally(() => {
      this.pendingAuth = null;
    });
    return this.pendingAuth;
  }

  private async obtainToken(): Promise<string> {
    const now = Date.now();
    if (this.token?.refreshToken && this.token.refreshExpiresAt - TOKEN_LEEWAY_MS > now) {
      const refreshed = await this.tokenRequest('/v2/auth/refresh', `Bearer ${this.token.refreshToken}`).catch(
        () => null,
      );
      if (refreshed) return refreshed;
    }
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64');
    const token = await this.tokenRequest('/v2/auth/token', `Basic ${basic}`);
    if (!token) throw new QPayError('QPay auth амжилтгүй');
    return token;
  }

  private async tokenRequest(path: string, authorization: string): Promise<string | null> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      if (path.endsWith('/token')) throw new QPayError(`QPay ${path} ${res.status}: ${await safeText(res)}`);
      return null;
    }
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
    };
    if (!body.access_token) return null;
    const now = Date.now();
    this.token = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: toEpochMs(body.expires_in, now),
      refreshExpiresAt: toEpochMs(body.refresh_expires_in, now),
    };
    return body.access_token;
  }
}

/**
 * QPay баримт бичигт `expires_in` нь Unix timestamp (секунд) гэж заасан. Үлдсэн секунд
 * ирсэн тохиолдолд (жижиг тоо) ч зөв ажиллахаар хамгаална. Байхгүй бол 1 цаг.
 */
function toEpochMs(value: number | undefined, now: number): number {
  if (!value || !Number.isFinite(value)) return now + 3_600_000;
  return value > 1_000_000_000 ? value * 1000 : now + value * 1000;
}

function toInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/** 1×1 PNG — fake нэхэмжлэхийн QR зураг (dev) */
const PLACEHOLDER_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface FakeInvoice {
  input: QPayInvoiceInput;
  invoiceId: string;
  rows: QPayPaymentRow[];
}

/**
 * Тест болон local dev-д. Тест `markPaid(invoiceId)` / `markPaid(invoiceId, 50)` (өөр дүн),
 * `failNext('create' | 'check')`-оор QPay-ийн хариуг дуурайна.
 * `autoPay` (dev) — нэхэмжлэх үүсмэгц төлөгдсөнд тооцно ("Төлбөр шалгах" дарахад кредит орно).
 */
export class FakeQPay implements QPayAdapter {
  readonly invoices: FakeInvoice[] = [];
  /** `checkInvoice` дуудагдсан тоо */
  checks = 0;
  private seq = 0;
  private failures: ('create' | 'check')[] = [];

  constructor(private readonly opts: { autoPay?: boolean } = {}) {}

  async createInvoice(input: QPayInvoiceInput): Promise<QPayInvoice> {
    this.consumeFailure('create');
    const invoiceId = `fake-invoice-${++this.seq}`;
    const inv: FakeInvoice = { input, invoiceId, rows: [] };
    this.invoices.push(inv);
    if (this.opts.autoPay) this.markPaid(invoiceId);
    return {
      invoiceId,
      qrText: `fake-qr:${invoiceId}`,
      qrImage: PLACEHOLDER_PNG,
      shortUrl: `https://qpay.example/${invoiceId}`,
      urls: [
        { name: 'Khan bank', description: 'Хаан банк', logo: '', link: `khanbank://q?qPay_QRcode=${invoiceId}` },
        { name: 'qPay wallet', description: 'qPay хэтэвч', logo: '', link: `qpaywallet://q?qPay_QRcode=${invoiceId}` },
      ],
    };
  }

  async checkInvoice(invoiceId: string): Promise<QPayCheckResult> {
    this.checks++;
    this.consumeFailure('check');
    const rows = this.invoices.find((i) => i.invoiceId === invoiceId)?.rows ?? [];
    return {
      paidAmountMnt: rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.amountMnt, 0),
      rows: rows.map((r) => ({ ...r })),
    };
  }

  /** Хэрэглэгч банкны апп-аар төлсөн мэт. `amountMnt` өгөхгүй бол нэхэмжлэхийн дүн. */
  markPaid(invoiceId: string, amountMnt?: number): void {
    const inv = this.get(invoiceId);
    inv.rows.push({ paymentId: `fake-payment-${++this.seq}`, status: 'PAID', amountMnt: amountMnt ?? inv.input.amountMnt });
  }

  markUnpaid(invoiceId: string): void {
    this.get(invoiceId).rows = [];
  }

  failNext(op: 'create' | 'check'): void {
    this.failures.push(op);
  }

  last(): FakeInvoice | undefined {
    return this.invoices[this.invoices.length - 1];
  }

  clear(): void {
    this.invoices.length = 0;
    this.failures = [];
    this.checks = 0;
  }

  private get(invoiceId: string): FakeInvoice {
    const inv = this.invoices.find((i) => i.invoiceId === invoiceId);
    if (!inv) throw new Error(`FakeQPay: ${invoiceId} алга`);
    return inv;
  }

  private consumeFailure(op: 'create' | 'check'): void {
    const i = this.failures.indexOf(op);
    if (i >= 0) {
      this.failures.splice(i, 1);
      throw new QPayError(`FakeQPay: ${op} алдаа (тест)`);
    }
  }
}
