import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { AuditPage, LegalDocView, SettingRevisionView, SettingView } from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { AuditService } from './audit.service';
import { LegalService } from './legal.service';
import { parseLegalSlug } from './legal.controller';
import { SettingsService } from './settings.service';

const SettingBody = z.object({ value: z.unknown() });
const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
});
const DraftBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(200_000),
});
const DraftPatch = DraftBody.partial().refine((v) => v.title !== undefined || v.body !== undefined, 'Хоосон');

/** `/admin/*` — зөвхөн ADMIN. Өөрчлөлт бүр audit log-д (service дотор, нэг transaction-д). */
@Controller('admin')
@Auth('ADMIN')
export class AdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly legal: LegalService,
  ) {}

  @Get('settings')
  listSettings(): Promise<SettingView[]> {
    return this.settings.list();
  }

  @Put('settings/:key')
  updateSetting(
    @Param('key') key: string,
    @Body(new ZodPipe(SettingBody)) body: z.infer<typeof SettingBody>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<SettingView> {
    return this.settings.update(key, body.value, { id: user.id, ip: req.ip });
  }

  @Get('settings/:key/history')
  settingHistory(@Param('key') key: string): Promise<SettingRevisionView[]> {
    return this.settings.history(key);
  }

  @Get('audit')
  auditLog(@Query(new ZodPipe(AuditQuery)) query: z.infer<typeof AuditQuery>): Promise<AuditPage> {
    return this.audit.list(query);
  }

  @Get('legal/:slug')
  legalVersions(@Param('slug') slug: string): Promise<LegalDocView[]> {
    return this.legal.listVersions(parseLegalSlug(slug));
  }

  @Post('legal/:slug')
  createLegalDraft(
    @Param('slug') slug: string,
    @Body(new ZodPipe(DraftBody)) body: z.infer<typeof DraftBody>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<LegalDocView> {
    return this.legal.createDraft(parseLegalSlug(slug), body, user.id, req.ip);
  }

  @Patch('legal/documents/:id')
  updateLegalDraft(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(DraftPatch)) body: z.infer<typeof DraftPatch>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<LegalDocView> {
    return this.legal.updateDraft(id, body, user.id, req.ip);
  }

  @Post('legal/documents/:id/publish')
  publishLegal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<LegalDocView> {
    return this.legal.publish(id, user.id, req.ip);
  }
}
