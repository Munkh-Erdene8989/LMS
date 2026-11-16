export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export class EmailSenderError extends Error {}

/** https://resend.com/docs/api-reference/emails/send-email */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new EmailSenderError(`Resend ${res.status}: ${body.slice(0, 300)}`);
    }
  }
}

/** Тест болон local dev-д: юу ч илгээхгүй, илгээсэн имэйлийг санана. */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  last(to?: string): EmailMessage | undefined {
    const list = to ? this.sent.filter((m) => m.to === to) : this.sent;
    return list[list.length - 1];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
