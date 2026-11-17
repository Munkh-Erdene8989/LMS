import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { ReferralLinkView, ReferralVisitResult } from '@lms/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, OptionalAuth, Viewer, type CurrentUserInfo } from '../auth/auth.guard';
import { ENV, type Env } from '../env';
import { ZodPipe } from '../zod-pipe';
import { setReferralCookie } from './cookie';
import { ReferralsService } from './referrals.service';

const VisitBody = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9]{6,32}$/) });

/** Referral линкээр орох (web-ийн `/r/<code>` хуудас дуудна). Нэвтрэлт заавал биш. */
@Controller('referrals')
export class ReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('visit')
  @HttpCode(200)
  @OptionalAuth()
  async visit(
    @Viewer() viewer: CurrentUserInfo | null,
    @Body(new ZodPipe(VisitBody)) b: z.infer<typeof VisitBody>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReferralVisitResult> {
    const now = new Date();
    const { teacherId, windowDays } = await this.referrals.visit(b.code, viewer?.id ?? null, now);
    // Нэвтэрсэн бол DB-д бичигдсэн — cookie зөвхөн зочинд (нэвтрэх/худалдан авах үед шилжинэ).
    if (!viewer) setReferralCookie(res, this.env, teacherId, now, windowDays);
    return { teacherId };
  }
}

/** Багшийн өөрийн referral линк, статистик. */
@Controller('teacher/referral')
@Auth('TEACHER')
export class TeacherReferralController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  mine(@CurrentUser() u: CurrentUserInfo): Promise<ReferralLinkView> {
    return this.referrals.myLink(u.id);
  }
}
