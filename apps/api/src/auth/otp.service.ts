import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IdentifierType, OtpChallenge, OtpPurpose } from '@lms/db';
import { BRAND } from '@lms/shared';
import { EMAIL_SENDER, type EmailSender } from '../adapters/email';
import { PHONE_VERIFIER, type PhoneVerifier } from '../adapters/phone-verifier';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthErrors } from './errors';
import { localPhone, normalizeIdentifier } from './identifier';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
/** Нэг identifier-т 10 минутад 3 код */
export const RATE_PER_IDENTIFIER = { max: 3, windowMs: 10 * 60_000 };
/** Нэг IP-ээс 1 цагт 20 код */
export const RATE_PER_IP = { max: 20, windowMs: 60 * 60_000 };

export interface StartedChallenge {
  challengeId: string;
  type: IdentifierType;
  expiresAt: string;
  /** Зөвхөн утсанд: хэрэглэгч `code`-ыг `shortcode` руу SMS-ээр илгээнэ. */
  phone?: { code: string; shortcode: string; smsUri: string; displayInstruction: string };
}

export type VerifyResult =
  | { status: 'pending' }
  | { status: 'verified'; type: IdentifierType; value: string };

@Injectable()
export class OtpService {
  private readonly log = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(PHONE_VERIFIER) private readonly phone: PhoneVerifier,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  normalize(type: IdentifierType, raw: string): string {
    const value = normalizeIdentifier(type, raw);
    if (!value) throw AuthErrors.invalidIdentifier();
    return value;
  }

  async start(input: {
    type: IdentifierType;
    value: string;
    purpose: OtpPurpose;
    ip: string | undefined;
    userId?: string;
  }): Promise<StartedChallenge> {
    const value = this.normalize(input.type, input.value);
    await this.enforceRateLimit(value, input.ip);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        type: input.type,
        value,
        purpose: input.purpose,
        userId: input.userId ?? null,
        codeHash: this.hash(value, code),
        ip: input.ip ?? null,
        expiresAt,
      },
    });

    try {
      if (input.type === 'PHONE') {
        const session = await this.phone.start(localPhone(value), code);
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { providerSessionId: session.sessionId },
        });
        return {
          challengeId: challenge.id,
          type: 'PHONE',
          expiresAt: expiresAt.toISOString(),
          phone: {
            code,
            shortcode: session.shortcode,
            smsUri: session.smsUri,
            displayInstruction: session.displayInstruction,
          },
        };
      }

      await this.email.send({
        to: value,
        subject: `${BRAND.name} — нэвтрэх код: ${code}`,
        text: `Таны нэвтрэх код: ${code}\nКод 5 минутын дотор хүчинтэй. Хэрэв та хүсээгүй бол энэ имэйлийг үл тоомсорлоно уу.`,
        html: `<p>Таны нэвтрэх код:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>Код 5 минутын дотор хүчинтэй. Хэрэв та хүсээгүй бол энэ имэйлийг үл тоомсорлоно уу.</p>`,
      });
      return { challengeId: challenge.id, type: 'EMAIL', expiresAt: expiresAt.toISOString() };
    } catch (err) {
      this.log.error(`OTP илгээхэд алдаа (${input.type}): ${(err as Error).message}`);
      // Илгээгдээгүй кодыг ашиглах боломжгүй болгоно (rate limit-д тооцогдсон хэвээр).
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      throw AuthErrors.providerUnavailable();
    }
  }

  /**
   * Кодыг шалгаж, амжилттай бол нэг удаа "ашигласан" болгоно.
   * Утсанд `code` хэрэггүй — verify.mn-ээс session-ий төлөвийг асууна; хэрэглэгч SMS
   * илгээгээгүй байвал `pending` буцаана (client дахин шалгана).
   */
  async verify(input: {
    challengeId: string;
    code?: string;
    purpose: OtpPurpose;
    userId?: string;
  }): Promise<VerifyResult> {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.purpose !== input.purpose || (challenge.userId ?? undefined) !== input.userId) {
      throw AuthErrors.challengeNotFound();
    }
    if (challenge.consumedAt) throw AuthErrors.otpUsed();
    if (challenge.expiresAt.getTime() <= Date.now()) throw AuthErrors.otpExpired();

    if (challenge.type === 'EMAIL') {
      await this.checkEmailCode(challenge, input.code);
    } else {
      const status = await this.phoneStatus(challenge);
      if (status === 'PENDING') return { status: 'pending' };
      if (status === 'EXPIRED') throw AuthErrors.otpExpired();
    }

    // Нэг удаа: зэрэг ирсэн хоёр хүсэлтээс зөвхөн нэг нь амжилттай.
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count === 0) throw AuthErrors.otpUsed();
    return { status: 'verified', type: challenge.type, value: challenge.value };
  }

  private async checkEmailCode(challenge: OtpChallenge, code: string | undefined): Promise<void> {
    if (!code) throw AuthErrors.codeRequired();
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw AuthErrors.tooManyAttempts();
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const given = Buffer.from(this.hash(challenge.value, code.trim()), 'hex');
    if (!timingSafeEqual(expected, given)) {
      const updated = await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= OTP_MAX_ATTEMPTS) throw AuthErrors.tooManyAttempts();
      throw AuthErrors.invalidCode();
    }
  }

  private async phoneStatus(challenge: OtpChallenge) {
    if (!challenge.providerSessionId) throw AuthErrors.otpExpired();
    try {
      return await this.phone.status(challenge.providerSessionId);
    } catch (err) {
      this.log.error(`verify.mn төлөв шалгахад алдаа: ${(err as Error).message}`);
      throw AuthErrors.providerUnavailable();
    }
  }

  private async enforceRateLimit(value: string, ip: string | undefined): Promise<void> {
    const now = Date.now();
    const perIdentifier = await this.prisma.otpChallenge.count({
      where: { value, createdAt: { gt: new Date(now - RATE_PER_IDENTIFIER.windowMs) } },
    });
    if (perIdentifier >= RATE_PER_IDENTIFIER.max) throw AuthErrors.rateLimited();
    if (!ip) return;
    const perIp = await this.prisma.otpChallenge.count({
      where: { ip, createdAt: { gt: new Date(now - RATE_PER_IP.windowMs) } },
    });
    if (perIp >= RATE_PER_IP.max) throw AuthErrors.rateLimited();
  }

  private hash(value: string, code: string): string {
    return createHmac('sha256', this.env.JWT_SECRET).update(`otp:${value}:${code}`).digest('hex');
  }
}
