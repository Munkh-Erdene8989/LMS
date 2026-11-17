import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { AdminPayoutPage, AdminPayoutView, PayoutHoldView, PayoutView, TeacherPayoutsView } from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { PayoutsService } from './payouts.service';

const Uuid = new ParseUUIDPipe();

const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.string().uuid().optional(),
});
const AdminListQuery = PageQuery.extend({
  status: z.enum(['REQUESTED', 'PAID', 'REJECTED']).default('REQUESTED'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const PaidBody = z.object({ transferRef: z.string().trim().min(1).max(200).optional() });
const ReasonBody = z.object({ reason: z.string().trim().min(1).max(2000) });

/** Багшийн payout: төлөв (үлдэгдэл, түгжигдсэн, босго, hold) + түүх, хүсэлт гаргах. */
@Controller('teacher/payouts')
@Auth('TEACHER')
export class TeacherPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  view(@CurrentUser() u: CurrentUserInfo, @Query(new ZodPipe(PageQuery)) q: z.infer<typeof PageQuery>): Promise<TeacherPayoutsView> {
    return this.payouts.teacherView(u.id, q);
  }

  @Post()
  request(@CurrentUser() u: CurrentUserInfo, @Req() req: Request): Promise<PayoutView> {
    return this.payouts.request(u.id, req.ip);
  }
}

/** Админы payout дараалал: жагсаалт, CSV export, төлсөн / татгалзах, hold. Бүгд audit-тай. */
@Controller('admin/payouts')
@Auth('ADMIN')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list(@Query(new ZodPipe(AdminListQuery)) q: z.infer<typeof AdminListQuery>): Promise<AdminPayoutPage> {
    return this.payouts.adminList(q);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payouts.csv"')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() admin: CurrentUserInfo, @Req() req: Request): Promise<string> {
    return this.payouts.exportCsv(admin.id, req.ip);
  }

  @Get('holds')
  holds(): Promise<PayoutHoldView[]> {
    return this.payouts.holds();
  }

  @Put('holds/:teacherId')
  @HttpCode(204)
  hold(
    @Param('teacherId', Uuid) teacherId: string,
    @Body(new ZodPipe(ReasonBody)) body: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    return this.payouts.hold(teacherId, admin.id, body.reason, req.ip);
  }

  @Delete('holds/:teacherId')
  @HttpCode(204)
  release(@Param('teacherId', Uuid) teacherId: string, @CurrentUser() admin: CurrentUserInfo, @Req() req: Request): Promise<void> {
    return this.payouts.release(teacherId, admin.id, req.ip);
  }

  @Post(':id/paid')
  @HttpCode(200)
  paid(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(PaidBody)) body: z.infer<typeof PaidBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminPayoutView> {
    return this.payouts.markPaid(id, admin.id, body, req.ip);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) body: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminPayoutView> {
    return this.payouts.reject(id, admin.id, body.reason, req.ip);
  }
}
