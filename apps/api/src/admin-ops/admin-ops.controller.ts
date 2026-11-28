import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type {
  AdminOverview,
  AdminPaymentRow,
  AdminReportSummary,
  AdminUserDetail,
  AdminUserPage,
  CreditAdjustResult,
  EarningsAdjustResult,
  ExpiredCreditsReport,
  PaymentIssuesView,
  ReconcileCanceledResult,
} from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { CreditsService } from '../credits/credits.service';
import { PayoutsService } from '../payouts/payouts.service';
import { ZodPipe } from '../zod-pipe';
import { AdminUsersService } from './admin-users.service';
import { AdminOverviewService } from './overview.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { AdminReportsService, reportBounds } from './reports.service';

const Uuid = new ParseUUIDPipe();

const SearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().uuid().optional(),
});
const Reason = z.string().trim().min(3).max(500);
const ReasonBody = z.object({ reason: Reason }).strict();
const CreditAdjustBody = z
  .object({
    delta: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((v) => v !== 0, 'Тэг байж болохгүй'),
    reason: Reason,
    idempotencyKey: z.string().uuid().optional(),
  })
  .strict();
const EarningsAdjustBody = z
  .object({
    amountMnt: z
      .number()
      .int()
      .min(-100_000_000)
      .max(100_000_000)
      .refine((v) => v !== 0, 'Тэг байж болохгүй'),
    reason: Reason,
    idempotencyKey: z.string().uuid().optional(),
  })
  .strict();
const ResolveBody = z.object({ action: z.enum(['GRANT', 'CLOSE']), note: Reason }).strict();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const RangeQuery = z.object({ from: Day.optional(), to: Day.optional() });

/** Админ: хэрэглэгч хайх, дэлгэрэнгүй, хаах/нээх, кредит/орлогын гар засвар (ticket 22). Бүгд audit-тай. */
@Controller('admin/users')
@Auth('ADMIN')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly credits: CreditsService,
    private readonly payouts: PayoutsService,
  ) {}

  @Get()
  search(@Query(new ZodPipe(SearchQuery)) q: z.infer<typeof SearchQuery>): Promise<AdminUserPage> {
    return this.users.search(q);
  }

  @Get(':id')
  detail(@Param('id', Uuid) id: string): Promise<AdminUserDetail> {
    return this.users.detail(id);
  }

  @Post(':id/block')
  @HttpCode(200)
  block(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) b: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminUserDetail> {
    return this.users.block(id, b.reason, admin.id, req.ip);
  }

  @Post(':id/unblock')
  @HttpCode(200)
  unblock(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) b: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminUserDetail> {
    return this.users.unblock(id, b.reason, admin.id, req.ip);
  }

  /** Кредит нэмэх/хасах — `CreditsService.adjust` (FIFO lot, сөрөг баланс үүсэхгүй). */
  @Post(':id/credits/adjust')
  @HttpCode(200)
  async adjustCredits(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(CreditAdjustBody)) b: z.infer<typeof CreditAdjustBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CreditAdjustResult> {
    const r = await this.credits.adjust({ userId: id, ...b, actorId: admin.id, ip: req.ip });
    return { userId: id, balance: r.balance, entryId: r.entryId, replayed: r.replayed };
  }

  /** Багшийн орлогын засвар (₮) — payout-той ижил түгжээ дор, нээлттэй хүсэлтийн дүнд хүрэхгүй. */
  @Post(':id/earnings/adjust')
  @HttpCode(200)
  adjustEarnings(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(EarningsAdjustBody)) b: z.infer<typeof EarningsAdjustBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<EarningsAdjustResult> {
    return this.payouts.adjustEarnings({ teacherId: id, ...b, adminId: admin.id, ip: req.ip });
  }
}

/** Админ: асуудалтай төлбөрийн тохирол (ticket 08/17-ийн үлдэгдэл). */
@Controller('admin/payments')
@Auth('ADMIN')
export class AdminPaymentsController {
  constructor(private readonly reconciliation: PaymentReconciliationService) {}

  @Get('issues')
  issues(): Promise<PaymentIssuesView> {
    return this.reconciliation.issues();
  }

  @Post('reconcile-canceled')
  @HttpCode(200)
  reconcileCanceled(@CurrentUser() admin: CurrentUserInfo, @Req() req: Request): Promise<ReconcileCanceledResult> {
    return this.reconciliation.reconcileCanceled(admin.id, req.ip);
  }

  @Post(':id/recheck')
  @HttpCode(200)
  recheck(@Param('id', Uuid) id: string, @CurrentUser() admin: CurrentUserInfo, @Req() req: Request): Promise<AdminPaymentRow> {
    return this.reconciliation.recheck(id, admin.id, req.ip);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ResolveBody)) b: z.infer<typeof ResolveBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminPaymentRow> {
    return this.reconciliation.resolve(id, b, admin.id, req.ip);
  }
}

/** Админ: тайлан. `is_test` гүйлгээ тусдаа хэсэгт. */
@Controller('admin/reports')
@Auth('ADMIN')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('summary')
  summary(@Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>): Promise<AdminReportSummary> {
    return this.reports.summary(reportBounds(q.from, q.to));
  }

  @Get('expired-credits')
  expiredCredits(@Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>): Promise<ExpiredCreditsReport> {
    return this.reports.expiredCredits(reportBounds(q.from, q.to));
  }
}

/** Админы тойм: хүлээгдэж буй ажлын тоо (тойм хуудас, цэсний badge). */
@Controller('admin/overview')
@Auth('ADMIN')
export class AdminOverviewController {
  constructor(private readonly overviews: AdminOverviewService) {}

  @Get()
  overview(): Promise<AdminOverview> {
    return this.overviews.overview();
  }
}
