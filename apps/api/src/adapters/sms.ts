/**
 * Гадны сервисийн adapter-ийн загвар.
 *
 * Дүрэм: модулиуд гадны сервисийг (verify.mn, Resend, QPay, Mux) шууд дуудахгүй,
 * зөвхөн энэ мэт interface-ийг DI token-оор авна. Тест нь fake хувилбараар орлуулна —
 * тест хийх цорын ганц seam бол API-ийн HTTP түвшин (docs/SPEC.md → Testing Decisions).
 */
export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SentSms {
  to: string;
  text: string;
}

/** Тест болон local dev-д: юу ч илгээхгүй, илгээсэн мессежийг санана. */
export class FakeSmsSender implements SmsSender {
  readonly sent: SentSms[] = [];

  async send(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }

  last(to?: string): SentSms | undefined {
    const list = to ? this.sent.filter((m) => m.to === to) : this.sent;
    return list[list.length - 1];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
