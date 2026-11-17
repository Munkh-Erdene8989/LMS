import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  REVIEW_BODY_MAX,
  REVIEW_REPLY_MAX,
  type AdminReviewPage,
  type AdminReviewView,
  type CourseReviewPage,
  type ReviewView,
} from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, OptionalAuth, Viewer, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { ReviewsService } from './reviews.service';

const Uuid = new ParseUUIDPipe();

const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  before: z.string().uuid().optional(),
});
const AdminQuery = z.object({
  status: z.enum(['ALL', 'VISIBLE', 'HIDDEN']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().uuid().optional(),
});
const ReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(REVIEW_BODY_MAX).optional(),
});
const ReplyBody = z.object({ body: z.string().trim().min(1).max(REVIEW_REPLY_MAX) });
const ReasonBody = z.object({ reason: z.string().trim().min(1).max(2000) });

/**
 * Курсийн үнэлгээ: нийтийн жагсаалт (optional auth — нэвтэрсэн бол өөрийн төлөв), бичих/засах, thread хариулт.
 */
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('catalog/courses/:id/reviews')
  @OptionalAuth()
  list(
    @Param('id', Uuid) id: string,
    @Query(new ZodPipe(PageQuery)) q: z.infer<typeof PageQuery>,
    @Viewer() viewer: CurrentUserInfo | null,
  ): Promise<CourseReviewPage> {
    return this.reviews.list(id, viewer, q);
  }

  /** Курс бүрт нэг үнэлгээ: байхгүй бол үүсгэнэ (эрх шалгана), байвал засна. */
  @Put('courses/:id/review')
  @Auth()
  upsert(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReviewBody)) body: z.infer<typeof ReviewBody>,
    @CurrentUser() u: CurrentUserInfo,
  ): Promise<ReviewView> {
    return this.reviews.upsert(id, u.id, body);
  }

  @Post('reviews/:id/replies')
  @Auth()
  reply(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReplyBody)) body: z.infer<typeof ReplyBody>,
    @CurrentUser() u: CurrentUserInfo,
  ): Promise<ReviewView> {
    return this.reviews.reply(id, u.id, body.body);
  }
}

/** Админы moderation: жагсаалт, үнэлгээ/хариулт нуух, сэргээх. Бүгд audit-тай. */
@Controller('admin/reviews')
@Auth('ADMIN')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query(new ZodPipe(AdminQuery)) q: z.infer<typeof AdminQuery>): Promise<AdminReviewPage> {
    return this.reviews.adminList(q);
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) body: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminReviewView> {
    return this.reviews.hide(id, admin.id, body.reason, req.ip);
  }

  @Post(':id/unhide')
  @HttpCode(200)
  unhide(@Param('id', Uuid) id: string, @CurrentUser() admin: CurrentUserInfo, @Req() req: Request): Promise<AdminReviewView> {
    return this.reviews.unhide(id, admin.id, req.ip);
  }

  @Post('replies/:id/hide')
  @HttpCode(200)
  hideReply(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) body: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminReviewView> {
    return this.reviews.hideReply(id, admin.id, body.reason, req.ip);
  }

  @Post('replies/:id/unhide')
  @HttpCode(200)
  unhideReply(@Param('id', Uuid) id: string, @CurrentUser() admin: CurrentUserInfo, @Req() req: Request): Promise<AdminReviewView> {
    return this.reviews.unhideReply(id, admin.id, req.ip);
  }
}
