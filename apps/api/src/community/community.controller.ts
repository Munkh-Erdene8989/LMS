import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import {
  COMMUNITY_COMMENT_MAX,
  COMMUNITY_MODERATION_REASON_MAX,
  COMMUNITY_POST_MAX,
  COMMUNITY_REMOVE_REASON_MAX,
  type CommunityCommentPage,
  type CommunityCommentView,
  type CommunityFeed,
  type CommunityLikeState,
  type AdminCommunityItem,
  type AdminCommunityPage,
  type CommunityMemberPage,
  type CommunityOverview,
  type CommunityPostView,
  type CommunitySummary,
  type UploadTicket,
} from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { CommunityService } from './community.service';

const Uuid = new ParseUUIDPipe();

const FeedQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});
const CommentsQuery = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const UploadBody = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    size: z.number().int().min(0),
    contentType: z.string().trim().min(1).max(100),
  })
  .strict();
const PostBody = z
  .object({
    body: z.string().max(COMMUNITY_POST_MAX).optional(),
    imageKey: z.string().min(1).max(300).optional(),
  })
  .strict();
const CommentBody = z.object({ body: z.string().max(COMMUNITY_COMMENT_MAX) }).strict();
const PostEditBody = z.object({ body: z.string().max(COMMUNITY_POST_MAX) }).strict();
const MembersQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const AdminListQuery = z.object({
  kind: z.enum(['post', 'comment']).default('post'),
  status: z.enum(['ALL', 'VISIBLE', 'HIDDEN']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().uuid().optional(),
});
const ReasonBody = z.object({ reason: z.string().trim().min(1).max(COMMUNITY_MODERATION_REASON_MAX) }).strict();
const AdminKind = new ZodPipe(z.enum(['posts', 'comments']));
const RemoveBody = z.object({ reason: z.string().max(COMMUNITY_REMOVE_REASON_MAX).optional() }).strict();

/** Community (ticket 19): багшийн id-аар. Эрх `CommunityService.role` — гишүүн, багш, админ. */
@Controller('communities')
@Auth()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get()
  mine(@CurrentUser() u: CurrentUserInfo): Promise<CommunitySummary[]> {
    return this.community.mine(u);
  }

  @Get(':teacherId')
  overview(@CurrentUser() u: CurrentUserInfo, @Param('teacherId', Uuid) teacherId: string): Promise<CommunityOverview> {
    return this.community.overview(u, teacherId);
  }

  @Get(':teacherId/posts')
  feed(
    @CurrentUser() u: CurrentUserInfo,
    @Param('teacherId', Uuid) teacherId: string,
    @Query(new ZodPipe(FeedQuery)) q: z.infer<typeof FeedQuery>,
  ): Promise<CommunityFeed> {
    return this.community.feed(u, teacherId, q);
  }

  @Post(':teacherId/posts')
  create(
    @CurrentUser() u: CurrentUserInfo,
    @Param('teacherId', Uuid) teacherId: string,
    @Body(new ZodPipe(PostBody)) b: z.infer<typeof PostBody>,
  ): Promise<CommunityPostView> {
    return this.community.createPost(u, teacherId, b);
  }

  @Post(':teacherId/uploads')
  upload(
    @CurrentUser() u: CurrentUserInfo,
    @Param('teacherId', Uuid) teacherId: string,
    @Body(new ZodPipe(UploadBody)) b: z.infer<typeof UploadBody>,
  ): Promise<UploadTicket> {
    return this.community.uploadTicket(u, teacherId, b);
  }
}

/** Нийтлэл, сэтгэгдлийн id-аар хийх үйлдлүүд (эрхийг нийтлэлийн community-гоор шалгана). */
@Controller('community')
@Auth()
export class CommunityPostsController {
  constructor(private readonly community: CommunityService) {}

  /** Нийтлэлийн текстийг засна (зөвхөн зохиогч). */
  @Patch('posts/:id')
  editPost(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(PostEditBody)) b: z.infer<typeof PostEditBody>,
  ): Promise<CommunityPostView> {
    return this.community.editPost(u, id, b.body);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  deletePost(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string, @Req() req: Request): Promise<void> {
    return this.community.deletePost(u, id, req.ip);
  }

  @Put('posts/:id/pin')
  pin(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CommunityPostView> {
    return this.community.setPinned(u, id, true);
  }

  @Delete('posts/:id/pin')
  unpin(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CommunityPostView> {
    return this.community.setPinned(u, id, false);
  }

  @Put('posts/:id/like')
  like(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CommunityLikeState> {
    return this.community.setLiked(u, id, true);
  }

  @Delete('posts/:id/like')
  unlike(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CommunityLikeState> {
    return this.community.setLiked(u, id, false);
  }

  @Get('posts/:id/comments')
  comments(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Query(new ZodPipe(CommentsQuery)) q: z.infer<typeof CommentsQuery>,
  ): Promise<CommunityCommentPage> {
    return this.community.comments(u, id, q);
  }

  @Post('posts/:id/comments')
  comment(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(CommentBody)) b: z.infer<typeof CommentBody>,
  ): Promise<CommunityCommentView> {
    return this.community.addComment(u, id, b.body);
  }

  /** Сэтгэгдлийг засна (зөвхөн зохиогч). */
  @Patch('comments/:id')
  editComment(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(CommentBody)) b: z.infer<typeof CommentBody>,
  ): Promise<CommunityCommentView> {
    return this.community.editComment(u, id, b.body);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  deleteComment(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string, @Req() req: Request): Promise<void> {
    return this.community.deleteComment(u, id, req.ip);
  }
}

/** Багш: өөрийн community-ийн гишүүд, хасах / сэргээх. */
@Controller('teacher/community')
@Auth('TEACHER')
export class TeacherCommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('members')
  members(@CurrentUser() u: CurrentUserInfo, @Query(new ZodPipe(MembersQuery)) q: z.infer<typeof MembersQuery>): Promise<CommunityMemberPage> {
    return this.community.members(u.id, q);
  }

  @Post('members/:userId/remove')
  @HttpCode(204)
  remove(
    @CurrentUser() u: CurrentUserInfo,
    @Param('userId', Uuid) userId: string,
    @Body(new ZodPipe(RemoveBody)) b: z.infer<typeof RemoveBody>,
    @Req() req: Request,
  ): Promise<void> {
    return this.community.removeMember(u.id, userId, b.reason, req.ip);
  }

  @Post('members/:userId/restore')
  @HttpCode(204)
  restore(@CurrentUser() u: CurrentUserInfo, @Param('userId', Uuid) userId: string, @Req() req: Request): Promise<void> {
    return this.community.restoreMember(u.id, userId, req.ip);
  }
}

/** Админ: бүх community-ийн нийтлэл/сэтгэгдлийн moderation (нуух, сэргээх, устгах — шалтгаантай, audit-тай). */
@Controller('admin/community')
@Auth('ADMIN')
export class AdminCommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('items')
  list(@Query(new ZodPipe(AdminListQuery)) q: z.infer<typeof AdminListQuery>): Promise<AdminCommunityPage> {
    return this.community.adminList(q);
  }

  @Post(':kind/:id/hide')
  @HttpCode(200)
  hide(
    @Param('kind', AdminKind) kind: 'posts' | 'comments',
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) b: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminCommunityItem> {
    return this.community.adminHide(single(kind), id, admin.id, b.reason, req.ip);
  }

  @Post(':kind/:id/unhide')
  @HttpCode(200)
  unhide(
    @Param('kind', AdminKind) kind: 'posts' | 'comments',
    @Param('id', Uuid) id: string,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<AdminCommunityItem> {
    return this.community.adminUnhide(single(kind), id, admin.id, req.ip);
  }

  @Post(':kind/:id/delete')
  @HttpCode(204)
  remove(
    @Param('kind', AdminKind) kind: 'posts' | 'comments',
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReasonBody)) b: z.infer<typeof ReasonBody>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    return this.community.adminDelete(single(kind), id, admin.id, b.reason, req.ip);
  }
}

const single = (kind: 'posts' | 'comments'): 'post' | 'comment' => (kind === 'posts' ? 'post' : 'comment');
