import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { OtpStartResponse, OtpVerifyResponse } from '@lms/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../env';
import { OrgInvitationsService } from '../organizations/org-invitations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { REFERRAL_COOKIE } from '../referrals/cookie';
import { ReferralsService } from '../referrals/referrals.service';
import { UsersService, toAuthUser } from '../users/users.service';
import { ZodPipe } from '../zod-pipe';
import { LIMITS, RateLimit } from '../rate-limit/rate-limit';
import { Auth, CurrentUser, type CurrentUserInfo } from './auth.guard';
import { AuthErrors } from './errors';
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from './cookies';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

export const StartSchema = z.object({
  type: z.enum(['PHONE', 'EMAIL']),
  value: z.string().min(1).max(254),
});
export const VerifySchema = z.object({
  challengeId: z.string().uuid(),
  /** Имэйлд заавал; утсанд хэрэггүй (verify.mn-ээс төлөв асууна). */
  code: z.string().regex(/^\d{6}$/, '6 оронтой код').optional(),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly referrals: ReferralsService,
    private readonly orgInvitations: OrgInvitationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Утас эсвэл имэйлээр бүртгүүлэх / нэвтрэх кодыг эхлүүлнэ. */
  @Post('otp/start')
  @RateLimit(LIMITS.otpStart)
  @HttpCode(200)
  start(@Body(new ZodPipe(StartSchema)) body: z.infer<typeof StartSchema>, @Req() req: Request): Promise<OtpStartResponse> {
    return this.otp.start({ ...body, purpose: 'LOGIN', ip: req.ip });
  }

  /** Код зөв бол хэрэглэгчийг олно/үүсгэнэ, cookie-д token олгоно. Утсанд SMS ирээгүй бол 202 pending. */
  @Post('otp/verify')
  @RateLimit(LIMITS.otpVerify)
  @HttpCode(200)
  async verify(
    @Body(new ZodPipe(VerifySchema)) body: z.infer<typeof VerifySchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OtpVerifyResponse> {
    const result = await this.otp.verify({ ...body, purpose: 'LOGIN' });
    if (result.status === 'pending') {
      res.status(202);
      return result;
    }
    const { user, isNew } = await this.users.findOrCreateByIdentifier(result.type, result.value);
    // Хаагдсан хэрэглэгч OTP зөв оруулсан ч нэвтрэхгүй (ticket 22).
    if (user.blockedAt) throw AuthErrors.blocked();
    if (isNew) await this.notifications.notify({ userId: user.id, type: 'WELCOME', link: '/me' });
    // Байгууллагаас ирсэн урилга (ticket 45): энэ identifier-ийн pending урилгууд гишүүнчлэл болно.
    await this.orgInvitations.acceptForIdentifierSafe(user.id, result.value);
    const tokens = await this.sessions.issue(user, { userAgent: req.headers['user-agent'] });
    setAuthCookies(res, this.env, tokens.access, tokens.refresh);
    // Зочин байхдаа referral линкээр орсон бол (cookie) хэрэглэгчид бүртгэнэ — өөр төхөөрөмжөөс авсан ч хүчинтэй.
    await this.referrals.claimCookieSafe(user.id, readCookie(req, REFERRAL_COOKIE));
    return { status: 'verified', user: toAuthUser(user), isNew };
  }

  @Post('refresh')
  @RateLimit(LIMITS.refresh)
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    try {
      const tokens = await this.sessions.rotate(readCookie(req, REFRESH_COOKIE), req.headers['user-agent']);
      setAuthCookies(res, this.env, tokens.access, tokens.refresh);
    } catch (err) {
      clearAuthCookies(res, this.env);
      throw err;
    }
  }

  /** Энэ төхөөрөмжөөс гарах */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.revoke(readCookie(req, REFRESH_COOKIE));
    clearAuthCookies(res, this.env);
  }

  /** Бүх төхөөрөмжөөс гарах */
  @Post('logout-all')
  @HttpCode(204)
  @Auth()
  async logoutAll(@CurrentUser() user: CurrentUserInfo, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.revokeAll(user.id);
    clearAuthCookies(res, this.env);
  }
}
