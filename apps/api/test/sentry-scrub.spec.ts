import { scrubSentryEvent, scrubString } from '@lms/shared';
import { initSentry, isSentryEnabled, sentryOptions } from '../src/observability/sentry';

describe('Sentry унтраалттай (DSN алга)', () => {
  it('sentryOptions null, init ажиллахгүй', () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: '  ' })).toBeNull();
    expect(initSentry({})).toBe(false);
    expect(isSentryEnabled()).toBe(false);
  });

  it('DSN байвал сонголт үүсгэж, PII цуглуулахгүй', () => {
    const o = sentryOptions({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1', NODE_ENV: 'production', SENTRY_TRACES_SAMPLE_RATE: '0.5' });
    expect(o).toMatchObject({ environment: 'production', tracesSampleRate: 0.5 });
    expect(o?.dataCollection).toMatchObject({ userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] });
    expect(sentryOptions({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1', SENTRY_TRACES_SAMPLE_RATE: 'abc' })?.tracesSampleRate).toBe(0.1);
  });
});

describe('scrubSentryEvent', () => {
  it('утас, имэйл, token, cookie-г арилгана', () => {
    const event = {
      message: 'OTP илгээж чадсангүй 99112233 / user@example.mn',
      user: { id: 'u1', email: 'user@example.mn', ip_address: '1.2.3.4', username: '99112233' },
      request: {
        url: 'https://lms.mn/api/auth/otp/start?phone=99112233',
        query_string: 'phone=99112233',
        cookies: { access_token: 'eyJhbGciOi.eyJzdWIiOi.sig12345' },
        data: { type: 'PHONE', value: '99112233' },
        headers: { cookie: 'access_token=abc', authorization: 'Bearer abc.def', 'user-agent': 'jest', 'x-api-key': 'zzz' },
      },
      extra: { phone: '+976 99112233', note: 'token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghij', nested: { password: 'x', ok: 'fine' } },
      breadcrumbs: [{ message: 'sent to a@b.mn', data: { otpCode: '123456' } }],
      exception: { values: [{ type: 'Error', value: 'Resend алдаа: user@example.mn' }] },
    };
    const out = scrubSentryEvent(event);
    const json = JSON.stringify(out);
    for (const secret of ['99112233', 'user@example.mn', 'eyJhbGciOi', 'abc.def', '123456', 'a@b.mn', 'zzz', '1.2.3.4']) {
      expect(json).not.toContain(secret);
    }
    expect(out.user).toEqual({ id: 'u1' });
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request).not.toHaveProperty('data');
    expect((out.request as { headers: Record<string, string> }).headers['user-agent']).toBe('jest');
    expect(out.request.url).toBe('https://lms.mn/api/auth/otp/start');
    // Алдааны төрөл, ердийн мессеж хадгалагдана
    expect(out.exception.values[0]).toMatchObject({ type: 'Error' });
    expect(out.extra.nested.ok).toBe('fine');
  });

  it('циклтэй/гүн бүтцэд унахгүй, анхны event-ийг өөрчлөхгүй', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    const event = { extra: a, user: { id: 5, email: 'e@e.mn' } };
    const out = scrubSentryEvent(event);
    expect(out.user).toEqual({ id: 5 });
    expect(event.user.email).toBe('e@e.mn');
  });

  it('scrubString: ердийн тоо, огноог хөнддөггүй', () => {
    expect(scrubString('курс 2026-11-18, үнэ 15000₮, id 12345')).toBe('курс 2026-11-18, үнэ 15000₮, id 12345');
    expect(scrubString('утас 88112233 болон +97699112233')).toBe('утас [redacted] болон [redacted]');
  });
});
