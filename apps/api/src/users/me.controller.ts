import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { AuthUser, OtpStartResponse } from '@lms/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { StartSchema, VerifySchema } from '../auth/auth.controller';
import { OtpService } from '../auth/otp.service';
import { ZodPipe } from '../zod-pipe';
import { UsersService } from './users.service';

const ProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.string().url().startsWith('https://').max(500).nullable().optional(),
  })
  .strict();

@Controller('me')
@Auth()
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
  ) {}

  @Get()
  me(@CurrentUser() user: CurrentUserInfo): Promise<AuthUser> {
    return this.users.get(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Body(new ZodPipe(ProfileSchema)) body: z.infer<typeof ProfileSchema>,
  ): Promise<AuthUser> {
    return this.users.updateProfile(user.id, body);
  }

  /** Хоёр дахь identifier холбох: өөр бүртгэлд байвал код илгээхээс өмнө татгалзана. */
  @Post('identifiers/start')
  @HttpCode(200)
  async startLink(
    @CurrentUser() user: CurrentUserInfo,
    @Body(new ZodPipe(StartSchema)) body: z.infer<typeof StartSchema>,
    @Req() req: Request,
  ): Promise<OtpStartResponse> {
    const value = this.otp.normalize(body.type, body.value);
    await this.users.assertCanLink(user.id, body.type, value);
    return this.otp.start({ type: body.type, value, purpose: 'LINK', userId: user.id, ip: req.ip });
  }

  @Post('identifiers/verify')
  @HttpCode(200)
  async verifyLink(
    @CurrentUser() user: CurrentUserInfo,
    @Body(new ZodPipe(VerifySchema)) body: z.infer<typeof VerifySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'pending' } | { status: 'verified'; user: AuthUser }> {
    const result = await this.otp.verify({ ...body, purpose: 'LINK', userId: user.id });
    if (result.status === 'pending') {
      res.status(202);
      return result;
    }
    return { status: 'verified', user: await this.users.link(user.id, result.type, result.value) };
  }
}
