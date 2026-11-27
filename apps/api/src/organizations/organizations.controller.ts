import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { OrgAdminDetail, OrgAdminRow, OrgInviteResult } from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { OrgInvitationsService, splitInviteText } from './org-invitations.service';
import { OrganizationsService } from './organizations.service';

const Uuid = new ParseUUIDPipe();

const OrgBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    active: z.boolean().default(true),
    contractEndsAt: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
    seatLimit: z.number().int().min(1).max(100_000),
  })
  .strict();
const OrgPatch = OrgBody.partial()
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Хоосон');

/** Нэг мөр (`entry`) эсвэл paste хийсэн олон мөр (`text`: шинэ мөр/таслалаар салгасан). */
const InviteBody = z
  .object({ text: z.string().max(100_000).optional(), entries: z.array(z.string().max(300)).max(1000).optional() })
  .strict();

/** `/admin/organizations/*` — зөвхөн ADMIN (байгууллагын менежер role байхгүй). Бүх үйлдэл audit log-д. */
@Controller('admin/organizations')
@Auth('ADMIN')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly invitations: OrgInvitationsService,
  ) {}

  @Get()
  list(): Promise<OrgAdminRow[]> {
    return this.orgs.list();
  }

  @Post()
  create(
    @Body(new ZodPipe(OrgBody)) body: z.infer<typeof OrgBody>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<OrgAdminRow> {
    return this.orgs.create(body, { id: user.id, ip: req.ip });
  }

  @Get(':id')
  get(@Param('id', Uuid) id: string): Promise<OrgAdminDetail> {
    return this.orgs.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(OrgPatch)) body: z.infer<typeof OrgPatch>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<OrgAdminRow> {
    return this.orgs.update(id, body, { id: user.id, ip: req.ip });
  }

  @Post(':id/invitations')
  @HttpCode(200)
  invite(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(InviteBody)) body: z.infer<typeof InviteBody>,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<OrgInviteResult> {
    const entries = [...(body.entries ?? []).flatMap(splitInviteText), ...splitInviteText(body.text ?? '')];
    return this.invitations.invite(id, entries, { id: user.id, ip: req.ip });
  }

  @Delete(':id/invitations/:invitationId')
  @HttpCode(204)
  cancelInvitation(
    @Param('id', Uuid) id: string,
    @Param('invitationId', Uuid) invitationId: string,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    return this.invitations.cancelInvitation(id, invitationId, { id: user.id, ip: req.ip });
  }

  @Delete(':id/members/:memberId')
  @HttpCode(204)
  removeMember(
    @Param('id', Uuid) id: string,
    @Param('memberId', Uuid) memberId: string,
    @CurrentUser() user: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    return this.invitations.removeMember(id, memberId, { id: user.id, ip: req.ip });
  }
}
