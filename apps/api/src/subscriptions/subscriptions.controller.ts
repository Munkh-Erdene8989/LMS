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
  Req,
} from '@nestjs/common';
import type {
  CardRegistrationStart,
  SubscriptionActionResult,
  SubscriptionOverview,
  SubscriptionPaymentStatus,
  SubscriptionPaymentView,
  SubscriptionPlanView,
} from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { CreditErrors } from '../credits/errors';
import { ZodPipe } from '../zod-pipe';
import { LIMITS, RateLimit, SkipRateLimit } from '../rate-limit/rate-limit';
import { SubscriptionPlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';

const Uuid = new ParseUUIDPipe();

const StartBody = z.object({ planId: z.string().uuid() }).strict();
const PlanFields = {
  name: z.string().trim().min(1).max(100),
  priceMnt: z.number().int().min(1).max(100_000_000),
  credits: z.number().int().min(1).max(1_000_000),
  active: z.boolean(),
  position: z.number().int().min(0).max(10_000),
};
const PlanBody = z
  .object({ ...PlanFields, active: PlanFields.active.default(true), position: PlanFields.position.default(0) })
  .strict();
const PlanPatch = z.object(PlanFields).partial().strict();

/** Хэрэглэгчийн сарын багц: төлөв, эхлэх, цуцлах, дахин идэвхжүүлэх, төлөх, карт. */
@Controller('subscription')
@Auth()
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly plans: SubscriptionPlansService,
  ) {}

  @Get()
  overview(@CurrentUser() u: CurrentUserInfo): Promise<SubscriptionOverview> {
    return this.subscriptions.overview(u.id);
  }

  @Get('plans')
  listPlans(): Promise<SubscriptionPlanView[]> {
    return this.plans.listActive();
  }

  @Post()
  start(
    @CurrentUser() u: CurrentUserInfo,
    @Body(new ZodPipe(StartBody)) b: z.infer<typeof StartBody>,
  ): Promise<SubscriptionActionResult> {
    return this.subscriptions.start(u.id, b.planId);
  }

  @Post('reactivate')
  @HttpCode(200)
  reactivate(@CurrentUser() u: CurrentUserInfo): Promise<SubscriptionActionResult> {
    return this.subscriptions.reactivate(u.id);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: CurrentUserInfo): Promise<SubscriptionOverview> {
    return this.subscriptions.cancel(u.id);
  }

  @Post('pay')
  @HttpCode(200)
  pay(@CurrentUser() u: CurrentUserInfo): Promise<SubscriptionActionResult> {
    return this.subscriptions.pay(u.id);
  }

  @Get('payments/:id')
  getPayment(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<SubscriptionPaymentView> {
    return this.subscriptions.getPayment(u.id, id);
  }

  @Post('payments/:id/check')
  @HttpCode(200)
  checkPayment(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<SubscriptionPaymentView> {
    return this.subscriptions.checkPayment(u.id, id);
  }

  @Post('card')
  @HttpCode(200)
  startCard(@CurrentUser() u: CurrentUserInfo): Promise<CardRegistrationStart> {
    return this.subscriptions.startCard(u.id);
  }

  @Post('card/check')
  @HttpCode(200)
  checkCard(@CurrentUser() u: CurrentUserInfo): Promise<SubscriptionOverview> {
    return this.subscriptions.checkCard(u.id);
  }

  @Delete('card')
  @HttpCode(200)
  removeCard(@CurrentUser() u: CurrentUserInfo): Promise<SubscriptionOverview> {
    return this.subscriptions.removeCard(u.id);
  }
}

/**
 * Сарын багцын QPay callback — нийтэд нээлттэй. URL-ийн токен таамаглашгүй (32 байт); body-д
 * итгэхгүй, QPay payment check-ээр дахин шалгана. Method тодорхойгүй тул GET/POST.
 */
@Controller('payments/qpay')
export class SubscriptionCallbackController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @All('subscription-callback/:token')
  @SkipRateLimit()
  @RateLimit(LIMITS.qpayCallback)
  @HttpCode(200)
  async callback(@Param('token') token: string): Promise<{ status: SubscriptionPaymentStatus }> {
    const payment = /^[\w-]{20,100}$/.test(token) ? await this.subscriptions.handleCallback(token) : null;
    if (!payment) throw CreditErrors.paymentNotFound();
    return { status: payment.status };
  }
}

/** Админ: сарын багц CRUD (audit-тай). */
@Controller('admin/subscription-plans')
@Auth('ADMIN')
export class AdminSubscriptionPlansController {
  constructor(private readonly plans: SubscriptionPlansService) {}

  @Get()
  list(): Promise<SubscriptionPlanView[]> {
    return this.plans.listAll();
  }

  @Post()
  create(
    @Body(new ZodPipe(PlanBody)) b: z.infer<typeof PlanBody>,
    @CurrentUser() u: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<SubscriptionPlanView> {
    return this.plans.create(b, u.id, req.ip);
  }

  @Patch(':id')
  update(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(PlanPatch)) b: z.infer<typeof PlanPatch>,
    @CurrentUser() u: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<SubscriptionPlanView> {
    return this.plans.update(id, b, u.id, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', Uuid) id: string, @CurrentUser() u: CurrentUserInfo, @Req() req: Request): Promise<void> {
    return this.plans.remove(id, u.id, req.ip);
  }
}
