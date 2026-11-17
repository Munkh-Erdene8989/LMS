import {
  All,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type {
  CreditAdjustResult,
  CreditBalanceView,
  CreditHistoryPage,
  CreditPackageView,
  PaymentStatus,
  TopupView,
} from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { normalizeEmail, normalizePhone } from '../auth/identifier';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../zod-pipe';
import { CreditsService } from './credits.service';
import { CreditErrors as E } from './errors';
import { CreditPackagesService } from './packages.service';
import { PaymentsService } from './payments.service';

const Uuid = new ParseUUIDPipe();

const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().uuid().optional(),
});
const TopupBody = z.object({ packageId: z.string().uuid() });
const PackageBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    credits: z.number().int().min(1).max(1_000_000),
    priceMnt: z.number().int().min(1).max(100_000_000),
    active: z.boolean().default(true),
    isTest: z.boolean().default(false),
    position: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
const PackagePatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    credits: z.number().int().min(1).max(1_000_000),
    priceMnt: z.number().int().min(1).max(100_000_000),
    active: z.boolean(),
    isTest: z.boolean(),
    position: z.number().int().min(0).max(10_000),
  })
  .partial()
  .strict();
const AdjustBody = z
  .object({
    /** Хэрэглэгчийн id, эсвэл утас/имэйл */
    user: z.string().trim().min(1).max(254),
    delta: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((v) => v !== 0, 'Тэг байж болохгүй'),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

/** Хэрэглэгчийн кредит: баланс, lot, түүх, QPay цэнэглэлт. */
@Controller('credits')
@Auth()
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly packages: CreditPackagesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  balance(@CurrentUser() u: CurrentUserInfo): Promise<CreditBalanceView> {
    return this.credits.view(u.id);
  }

  @Get('history')
  history(
    @CurrentUser() u: CurrentUserInfo,
    @Query(new ZodPipe(HistoryQuery)) q: z.infer<typeof HistoryQuery>,
  ): Promise<CreditHistoryPage> {
    return this.credits.history(u.id, q);
  }

  @Get('packages')
  listPackages(@CurrentUser() u: CurrentUserInfo): Promise<CreditPackageView[]> {
    return this.packages.listForUser(u.roles.includes('ADMIN'));
  }

  @Post('topups')
  topup(@CurrentUser() u: CurrentUserInfo, @Body(new ZodPipe(TopupBody)) b: z.infer<typeof TopupBody>): Promise<TopupView> {
    return this.payments.createTopup(u, b.packageId);
  }

  @Get('topups/:id')
  getTopup(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<TopupView> {
    return this.payments.getOwn(u.id, id);
  }

  @Post('topups/:id/check')
  @HttpCode(200)
  check(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<TopupView> {
    return this.payments.checkOwn(u.id, id);
  }
}

/**
 * QPay callback — нийтэд нээлттэй. URL-ийн токен нь таамаглашгүй (32 байт); body-д итгэхгүй,
 * төлбөрийг QPay payment check-ээр дахин шалгана. Method тодорхойгүй тул GET/POST хоёуланг.
 */
@Controller('payments/qpay')
export class QPayCallbackController {
  constructor(private readonly payments: PaymentsService) {}

  @All('callback/:token')
  @HttpCode(200)
  async callback(@Param('token') token: string): Promise<{ status: PaymentStatus }> {
    const payment = /^[\w-]{20,100}$/.test(token) ? await this.payments.handleCallback(token) : null;
    if (!payment) throw E.paymentNotFound();
    return { status: payment.status };
  }
}

/** Админ: кредит багц CRUD, гар засвар. Бүгд audit-тэй. */
@Controller('admin')
@Auth('ADMIN')
export class AdminCreditsController {
  constructor(
    private readonly packages: CreditPackagesService,
    private readonly credits: CreditsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('credit-packages')
  list(): Promise<CreditPackageView[]> {
    return this.packages.listAll();
  }

  @Post('credit-packages')
  create(
    @Body(new ZodPipe(PackageBody)) b: z.infer<typeof PackageBody>,
    @CurrentUser() u: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CreditPackageView> {
    return this.packages.create(b, u.id, req.ip);
  }

  @Patch('credit-packages/:id')
  update(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(PackagePatch)) b: z.infer<typeof PackagePatch>,
    @CurrentUser() u: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CreditPackageView> {
    return this.packages.update(id, b, u.id, req.ip);
  }

  @Delete('credit-packages/:id')
  @HttpCode(204)
  remove(@Param('id', Uuid) id: string, @CurrentUser() u: CurrentUserInfo, @Req() req: Request): Promise<void> {
    return this.packages.remove(id, u.id, req.ip);
  }

  @Post('credits/adjust')
  @HttpCode(200)
  async adjust(
    @Body(new ZodPipe(AdjustBody)) b: z.infer<typeof AdjustBody>,
    @CurrentUser() u: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CreditAdjustResult> {
    const userId = await this.resolveUser(b.user);
    const balance = await this.credits.adjust({ userId, delta: b.delta, reason: b.reason, actorId: u.id, ip: req.ip });
    return { userId, balance };
  }

  private async resolveUser(input: string): Promise<string> {
    if (z.string().uuid().safeParse(input).success) return input;
    const value = input.includes('@') ? normalizeEmail(input) : normalizePhone(input);
    const found = value ? await this.prisma.identifier.findUnique({ where: { value } }) : null;
    if (!found) throw E.userNotFound();
    return found.userId;
  }
}
