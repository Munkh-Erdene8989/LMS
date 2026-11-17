import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { PurchasePage, PurchaseResult, TeacherEarningsView } from '@lms/shared';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { TeacherEarningsService } from './earnings.service';
import { PurchaseErrors as E } from './errors';
import { PurchasesService } from './purchases.service';

const Uuid = new ParseUUIDPipe();

/** `confirmNoRefund` заавал `true` (буцаалтгүй анхааруулгыг зөвшөөрсөн), `expectedCredits` — харсан үнэ. */
const PurchaseBody = z.object({
  confirmNoRefund: z.boolean().optional(),
  expectedCredits: z.number().int().min(0).max(10_000_000),
});
type PurchaseBody = z.infer<typeof PurchaseBody>;

const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.string().uuid().optional(),
});

function confirmed(b: PurchaseBody): { expectedCredits: number } {
  if (b.confirmNoRefund !== true) throw E.noRefundNotConfirmed();
  return { expectedCredits: b.expectedCredits };
}

/** Кредитээр lesson / курс худалдаж авах, өөрийн худалдан авалтын түүх. */
@Controller('purchases')
@Auth()
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post('lessons/:id')
  buyLesson(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(PurchaseBody)) b: PurchaseBody,
  ): Promise<PurchaseResult> {
    return this.purchases.buyLesson(u, id, confirmed(b));
  }

  @Post('courses/:id')
  buyCourse(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(PurchaseBody)) b: PurchaseBody,
  ): Promise<PurchaseResult> {
    return this.purchases.buyCourse(u, id, confirmed(b));
  }

  @Get()
  list(@CurrentUser() u: CurrentUserInfo, @Query(new ZodPipe(PageQuery)) q: z.infer<typeof PageQuery>): Promise<PurchasePage> {
    return this.purchases.list(u.id, q);
  }
}

/** Багшийн орлого: үлдэгдэл + ledger. */
@Controller('teacher/earnings')
@Auth('TEACHER')
export class TeacherEarningsController {
  constructor(private readonly earnings: TeacherEarningsService) {}

  @Get()
  view(@CurrentUser() u: CurrentUserInfo, @Query(new ZodPipe(PageQuery)) q: z.infer<typeof PageQuery>): Promise<TeacherEarningsView> {
    return this.earnings.view(u.id, q);
  }
}
