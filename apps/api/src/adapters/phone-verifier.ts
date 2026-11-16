/**
 * Гадны сервисийн adapter-ийн загвар.
 *
 * Дүрэм: модулиуд гадны сервисийг (verify.mn, Resend, QPay, Mux) шууд дуудахгүй,
 * зөвхөн энэ мэт interface-ийг DI token-оор авна. Тест нь fake хувилбараар орлуулна —
 * тест хийх цорын ганц seam бол API-ийн HTTP түвшин (docs/SPEC.md → Testing Decisions).
 *
 * verify.mn нь SMS илгээдэггүй: хэрэглэгч өөрийн утаснаас `text` кодыг 144773 руу илгээж,
 * бид session-ий төлөвийг шалгана (mobile-originated баталгаажуулалт).
 */
export interface PhoneVerificationSession {
  sessionId: string;
  shortcode: string;
  /** `sms:144773?body=...` — утсан дээр SMS апп нээх линк */
  smsUri: string;
  /** Хэрэглэгчид харуулах монгол заавар */
  displayInstruction: string;
  expiresAt: Date;
}

export type PhoneVerificationStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED';

export interface PhoneVerifier {
  /** `phone` — 8 оронтой монгол дугаар, `code` — хэрэглэгчийн илгээх текст. */
  start(phone: string, code: string): Promise<PhoneVerificationSession>;
  status(sessionId: string): Promise<PhoneVerificationStatus>;
}

export const PHONE_VERIFIER = Symbol('PHONE_VERIFIER');

export class PhoneVerifierError extends Error {}

/** https://verify.mn/#api */
export class VerifyMnPhoneVerifier implements PhoneVerifier {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.verify.mn',
  ) {}

  async start(phone: string, code: string): Promise<PhoneVerificationSession> {
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text: code }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new PhoneVerifierError(`verify.mn POST /sessions ${res.status}: ${await safeText(res)}`);
    }
    const body = (await res.json()) as {
      sessionId: string;
      shortcode: string;
      smsUri: string;
      displayInstruction: string;
      expiresAt: string;
    };
    return {
      sessionId: body.sessionId,
      shortcode: body.shortcode,
      smsUri: body.smsUri,
      displayInstruction: body.displayInstruction,
      expiresAt: new Date(body.expiresAt),
    };
  }

  async status(sessionId: string): Promise<PhoneVerificationStatus> {
    const res = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return 'EXPIRED';
    if (!res.ok) {
      throw new PhoneVerifierError(`verify.mn GET /sessions ${res.status}: ${await safeText(res)}`);
    }
    const body = (await res.json()) as { sessionStatus: PhoneVerificationStatus };
    return body.sessionStatus;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * Тест болон local dev-д. Session-уудыг санах ойд хадгална.
 * Тест `markVerified(phone)`-оор "хэрэглэгч SMS илгээсэн" мэт дуурайна.
 */
export class FakePhoneVerifier implements PhoneVerifier {
  readonly sessions: { sessionId: string; phone: string; code: string; status: PhoneVerificationStatus }[] = [];
  private seq = 0;

  async start(phone: string, code: string): Promise<PhoneVerificationSession> {
    const sessionId = `fake-${++this.seq}`;
    this.sessions.push({ sessionId, phone, code, status: 'PENDING' });
    return {
      sessionId,
      shortcode: '144773',
      smsUri: `sms:144773?body=${code}`,
      displayInstruction: `${code} гэж бичээд 144773 дугаар руу илгээнэ үү.`,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    };
  }

  async status(sessionId: string): Promise<PhoneVerificationStatus> {
    return this.sessions.find((s) => s.sessionId === sessionId)?.status ?? 'EXPIRED';
  }

  last(phone?: string) {
    const list = phone ? this.sessions.filter((s) => s.phone === phone) : this.sessions;
    return list[list.length - 1];
  }

  /** Хамгийн сүүлийн session-ийг баталгаажуулна (хэрэглэгч SMS илгээсэн мэт). */
  markVerified(phone?: string): void {
    const s = this.last(phone);
    if (!s) throw new Error(`FakePhoneVerifier: ${phone ?? ''} session алга`);
    s.status = 'VERIFIED';
  }

  markExpired(phone?: string): void {
    const s = this.last(phone);
    if (s) s.status = 'EXPIRED';
  }

  clear(): void {
    this.sessions.length = 0;
  }
}
