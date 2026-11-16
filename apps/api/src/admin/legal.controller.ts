import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import type { LegalDocType } from '@lms/db';
import { LEGAL_SLUGS, type LegalDocView, type LegalStatus } from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { LegalService } from './legal.service';

export function parseLegalSlug(slug: string): LegalDocType {
  const entry = Object.entries(LEGAL_SLUGS).find(([, s]) => s === slug);
  if (!entry) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Баримт олдсонгүй.' });
  return entry[0] as LegalDocType;
}

const AcceptBody = z.object({ version: z.number().int().positive() });

/** Нийтэд харагдах хууль эрх зүйн хуудас + хэрэглэгчийн зөвшөөрөл. */
@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('legal/:slug')
  current(@Param('slug') slug: string): Promise<LegalDocView> {
    return this.legal.publicCurrent(parseLegalSlug(slug));
  }

  @Get('legal/:slug/versions/:version')
  version(@Param('slug') slug: string, @Param('version', ParseIntPipe) version: number): Promise<LegalDocView> {
    return this.legal.publicVersion(parseLegalSlug(slug), version);
  }

  @Post('legal/:slug/accept')
  @Auth()
  accept(
    @Param('slug') slug: string,
    @Body(new ZodPipe(AcceptBody)) body: z.infer<typeof AcceptBody>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<LegalStatus> {
    return this.legal.accept(user.id, parseLegalSlug(slug), body.version, req.ip);
  }

  @Get('me/legal')
  @Auth()
  status(@CurrentUser() user: CurrentUserInfo): Promise<LegalStatus[]> {
    return this.legal.status(user.id);
  }
}
