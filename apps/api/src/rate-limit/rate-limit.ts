import {
  applyDecorators,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ApiError } from '../auth/errors';
import { ENV, type Env } from '../env';
import { RATE_LIMIT_STORE, type RateLimitStore } from './rate-limit.store';

export interface RateLimitPolicy {
  /** Тоолуурын нэр (route бүлэг). Өөр нэртэй тоолуурууд хоорондоо нөлөөлөхгүй. */
  name: string;
  limit: number;
  windowMs: number;
  /** `user`: нэвтэрсэн бол хэрэглэгчээр, үгүй бол IP-ээр. Анхдагч `ip`. */
  by?: 'ip' | 'user';
}

const POLICY_KEY = 'rate-limit:policy';
const SKIP_KEY = 'rate-limit:skip';

/** Өөрчлөх (POST/PUT/PATCH/DELETE) хүсэлтэд IP тутамд. GET-д үгүй: web-ийн server render нэг IP-ээс олон хэрэглэгчийн GET илгээдэг. */
export const GLOBAL_POLICY: RateLimitPolicy = { name: 'global-write', limit: 300, windowMs: 60_000 };

const MINUTE = 60_000;
/** Нэр бүхий хязгаарууд — аюулгүй байдлын шалгалт (ticket 23) эндээс харагдана. */
export const LIMITS = {
  otpStart: { name: 'auth.otp-start', limit: 10, windowMs: MINUTE },
  otpVerify: { name: 'auth.otp-verify', limit: 20, windowMs: 10 * MINUTE },
  refresh: { name: 'auth.refresh', limit: 60, windowMs: MINUTE },
  topup: { name: 'pay.topup', limit: 10, windowMs: MINUTE, by: 'user' },
  topupCheck: { name: 'pay.topup-check', limit: 30, windowMs: MINUTE, by: 'user' },
  purchase: { name: 'pay.purchase', limit: 20, windowMs: MINUTE, by: 'user' },
  payoutRequest: { name: 'pay.payout-request', limit: 5, windowMs: MINUTE, by: 'user' },
  /** QPay callback: token нь нууц, гэхдээ тааж үзэхээс хамгаална. */
  qpayCallback: { name: 'pay.qpay-callback', limit: 120, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * Route-д тусгай хязгаар тавина (глобал хязгаарын дээр нэмэгдэнэ).
 * `by: 'user'` бол `@Auth()`-ийн ДАРАА ажиллах ёстой тул class-д биш method-д тавина.
 */
export const RateLimit = (policy: RateLimitPolicy) =>
  applyDecorators(SetMetadata(POLICY_KEY, policy), UseGuards(RateLimitGuard));

/** Глобал хязгаараас чөлөөлнө (health check, webhook). */
export const SkipRateLimit = () => SetMetadata(SKIP_KEY, true);

type Req = Request & { user?: { id: string } };

async function enforce(
  store: RateLimitStore,
  ctx: ExecutionContext,
  policy: RateLimitPolicy,
): Promise<boolean> {
  const http = ctx.switchToHttp();
  const req = http.getRequest<Req>();
  const subject = policy.by === 'user' && req.user ? `u:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`;
  const { count, resetMs } = await store.hit(`${policy.name}:${subject}`, policy.windowMs);
  if (count > policy.limit) {
    http.getResponse<Response>().setHeader('Retry-After', String(Math.max(1, Math.ceil(resetMs / 1000))));
    throw new ApiError(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
      'Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.',
    );
  }
  return true;
}

/** `@RateLimit(...)`-ээр заасан route-ийн тусгай хязгаар. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> | boolean {
    if (!this.env.RATE_LIMIT_ENABLED) return true;
    const policy = this.reflector.get<RateLimitPolicy | undefined>(POLICY_KEY, ctx.getHandler());
    return policy ? enforce(this.store, ctx, policy) : true;
  }
}

/** APP_GUARD: өөрчлөх route бүрд IP-ээр ерөнхий хязгаар (`@SkipRateLimit()`-тэйг оруулахгүй). */
@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> | boolean {
    if (!this.env.RATE_LIMIT_ENABLED) return true;
    const method = ctx.switchToHttp().getRequest<Request>().method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
    if (this.reflector.getAllAndOverride<boolean | undefined>(SKIP_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    return enforce(this.store, ctx, GLOBAL_POLICY);
  }
}
