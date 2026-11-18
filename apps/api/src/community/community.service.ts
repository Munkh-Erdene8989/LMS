import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@lms/db';
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_IMAGE_TYPES,
  COMMUNITY_MEMBERS_PAGE_SIZE,
  COMMUNITY_PIN_MAX,
  liveEndsAt,
  type AdminCommunityItem,
  type AdminCommunityPage,
  type CommunityCommentPage,
  type CommunityCommentView,
  type CommunityFeed,
  type CommunityLikeState,
  type CommunityLiveItem,
  type CommunityMemberPage,
  type CommunityOverview,
  type CommunityPerson,
  type CommunityPostView,
  type CommunityRole,
  type CommunitySummary,
  type UploadTicket,
} from '@lms/shared';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { AuditService } from '../admin/audit.service';
import type { CurrentUserInfo } from '../auth/auth.guard';
import type { LiveContent } from '../catalog/lesson-types';
import { teacherRef, teacherSelect } from '../catalog/public-catalog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ownedCourses, ownsAnyLessonOfTeacher, ownsFrom, teachersOwnedBy } from '../purchases/entitlements';
import { CommunityErrors as E } from './errors';

/** Зургийн signed URL хэр удаан хүчинтэй (хуудас нээлттэй байх хугацаанд). */
export const COMMUNITY_IMAGE_URL_TTL = 60 * 60;
const FEED_PAGE_MAX = 30;
const COMMENT_PAGE_MAX = 100;
const UPCOMING_LIVE_MAX = 20;
/** Нэг сэтгэгдлээр хамгийн ихдээ хэдэн оролцогчид мэдэгдэл очих */
const COMMENT_NOTIFY_MAX = 50;
type HiddenTarget = { authorId: string; teacherId: string; postId: string };
const EXCERPT_LENGTH = 80;

const authorSelect = { select: teacherSelect } as const;

type AuthorRow = Prisma.UserGetPayload<{ select: typeof teacherSelect }>;

/** Тухайн үзэгчид харагдах нийтлэлийн мөр. */
function postInclude(viewerId: string) {
  return {
    author: authorSelect,
    _count: { select: { comments: true, likes: true } },
    likes: { where: { userId: viewerId }, select: { userId: true } },
  } as const satisfies Prisma.CommunityPostInclude;
}
type PostRow = Prisma.CommunityPostGetPayload<{ include: ReturnType<typeof postInclude> }>;

const commentInclude = { author: authorSelect } as const satisfies Prisma.CommunityCommentInclude;
type CommentRow = Prisma.CommunityCommentGetPayload<{ include: typeof commentInclude }>;

export interface PostInput {
  body?: string;
  imageKey?: string;
}

/**
 * Багшийн community (ticket 19). Community = багш; тусдаа "community" мөр, гишүүнчлэлийн хүснэгт алга.
 *
 * - Гишүүн: тухайн багшийн ЯМАР НЭГ lesson-ыг эзэмшдэг (lesson `Entitlement` эсвэл курсийн `CourseEntitlement`,
 *   `purchases/entitlements.ts`) БӨГӨӨД `community_removals`-д байхгүй. Худалдан авалт хийгдмэгц автоматаар
 *   гишүүн болно, мөр бичихгүй. Багш өөрийн community-д эзэн (`TEACHER`), админ модератор (`ADMIN`).
 * - Гишүүн биш → 403 `COMMUNITY_MEMBERS_ONLY`, хасагдсан → 403 `COMMUNITY_REMOVED` (бүх endpoint-д ижил,
 *   нийтлэл/сэтгэгдлийн id-аар хандахад ч).
 * - Нийтлэл: Markdown текст ба/эсвэл нэг зураг (`private` bucket, signed URL). Pin зөвхөн багш (≤ 3).
 *   Устгах: зохиогч өөрөө, эсвэл багш/админ (модерац — audit log-д).
 * - Сэтгэгдэл: нийтлэлийн зохиогч болон өмнө сэтгэгдэл бичсэн оролцогчдод мэдэгдэл (өөрт нь биш, хасагдсанд биш).
 * - Live хуанли: багшийн нийтлэгдсэн курсуудын дуусаагүй LIVE хичээлүүд — линкгүй (хичээлийн хуудсанд, ticket 14).
 */
@Injectable()
export class CommunityService {
  private readonly log = new Logger(CommunityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---- эрх --------------------------------------------------------------------

  /** Үзэгчийн эрх; хандах эрхгүй бол алдаа шиднэ. */
  async role(viewer: CurrentUserInfo, teacherId: string): Promise<CommunityRole> {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, select: { roles: true } });
    if (!teacher || !teacher.roles.includes('TEACHER')) throw E.notFound();
    if (viewer.id === teacherId) return 'TEACHER';
    if (viewer.roles.includes('ADMIN')) return 'ADMIN';
    const removal = await this.prisma.communityRemoval.findUnique({
      where: { teacherId_userId: { teacherId, userId: viewer.id } },
      select: { userId: true },
    });
    if (removal) throw E.removed();
    if (!(await ownsAnyLessonOfTeacher(this.prisma, viewer.id, teacherId))) throw E.membersOnly();
    return 'MEMBER';
  }

  // ---- community --------------------------------------------------------------

  /** Миний community-ууд: lesson-ыг нь эзэмшдэг багш нар (хасагдсанаас бусад) + өөрийнх (багш бол). */
  async mine(viewer: CurrentUserInfo): Promise<CommunitySummary[]> {
    const [owned, removed] = await Promise.all([
      teachersOwnedBy(this.prisma, viewer.id),
      this.prisma.communityRemoval.findMany({ where: { userId: viewer.id }, select: { teacherId: true } }),
    ]);
    const removedIds = new Set(removed.map((r) => r.teacherId));
    const ids = owned.filter((id) => !removedIds.has(id) && id !== viewer.id);
    if (viewer.roles.includes('TEACHER')) ids.unshift(viewer.id);
    if (ids.length === 0) return [];

    const [teachers, stats] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids }, roles: { has: 'TEACHER' } }, select: teacherSelect }),
      this.prisma.communityPost.groupBy({
        by: ['teacherId'],
        where: { teacherId: { in: ids } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);
    const byId = new Map(teachers.map((u) => [u.id, u]));
    const statsById = new Map(stats.map((s) => [s.teacherId, s]));
    return ids.flatMap((id) => {
      const u = byId.get(id);
      if (!u) return [];
      const s = statsById.get(id);
      return [
        {
          teacher: teacherRef(u),
          role: id === viewer.id ? ('TEACHER' as const) : ('MEMBER' as const),
          postCount: s?._count._all ?? 0,
          lastPostAt: s?._max.createdAt?.toISOString() ?? null,
        },
      ];
    });
  }

  async overview(viewer: CurrentUserInfo, teacherId: string, now = new Date()): Promise<CommunityOverview> {
    const role = await this.role(viewer, teacherId);
    const [teacher, memberCount, upcomingLive] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: teacherId }, select: teacherSelect }),
      this.memberCount(teacherId),
      this.upcomingLive(viewer, teacherId, role, now),
    ]);
    const app = teacher.teacherApplication?.status === 'APPROVED' ? teacher.teacherApplication : null;
    return { teacher: { ...teacherRef(teacher), expertise: app?.expertise ?? null }, role, memberCount, upcomingLive };
  }

  /** Хасагдаагүй гишүүдийн тоо — бүгд SQL-д (эзэмшигчдийг санах ойд ачаалахгүй). */
  private async memberCount(teacherId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ members: bigint }[]>(Prisma.sql`
      ${customersCte(teacherId)}
      SELECT COUNT(*) AS members
      FROM customers cu
      WHERE NOT EXISTS (
        SELECT 1 FROM community_removals r WHERE r.teacher_id = ${teacherId}::uuid AND r.user_id = cu.user_id
      )`);
    return Number(rows[0]?.members ?? 0);
  }

  /** Багшийн нийтлэгдсэн курсуудын дуусаагүй, шалгагдсан LIVE хичээлүүд (эхлэх цагаар). */
  private async upcomingLive(viewer: CurrentUserInfo, teacherId: string, role: CommunityRole, now: Date): Promise<CommunityLiveItem[]> {
    const [lessons, owned] = await Promise.all([
      this.prisma.lesson.findMany({
        where: {
          type: 'LIVE',
          reviewStatus: 'APPROVED',
          archivedAt: null,
          course: { teacherId, status: 'PUBLISHED' },
        },
        select: { id: true, courseId: true, title: true, content: true, course: { select: { title: true } } },
      }),
      role === 'MEMBER' ? ownedCourses(this.prisma, viewer.id) : Promise.resolve(null),
    ]);
    const items: CommunityLiveItem[] = [];
    for (const l of lessons) {
      const c = l.content as unknown as LiveContent;
      if (!c.startsAt || !c.durationMinutes) continue;
      const endsAt = liveEndsAt(c.startsAt, c.durationMinutes);
      if (new Date(endsAt) <= now) continue;
      const o = owned?.get(l.courseId);
      items.push({
        lessonId: l.id,
        courseId: l.courseId,
        courseTitle: l.course.title,
        title: l.title,
        startsAt: c.startsAt,
        durationMinutes: c.durationMinutes,
        endsAt,
        canJoin: owned === null || (!!o && ownsFrom(o, l.id)),
      });
    }
    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return items.slice(0, UPCOMING_LIVE_MAX);
  }

  // ---- нийтлэл ----------------------------------------------------------------

  /** Pin-тэй нийтлэлүүд (эхний хуудсанд) + бусад нь шинэ нь эхэндээ, `before` cursor-оор. */
  async feed(viewer: CurrentUserInfo, teacherId: string, opts: { before?: string; limit?: number }): Promise<CommunityFeed> {
    const role = await this.role(viewer, teacherId);
    const limit = Math.min(opts.limit ?? FEED_PAGE_MAX, FEED_PAGE_MAX);
    const include = postInclude(viewer.id);

    let cursorWhere: Prisma.CommunityPostWhereInput = {};
    if (opts.before) {
      const cursor = await this.prisma.communityPost.findFirst({ where: { id: opts.before, teacherId }, select: { id: true, createdAt: true } });
      if (!cursor) throw E.postNotFound();
      cursorWhere = { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
    }
    const [pinned, rows] = await Promise.all([
      opts.before
        ? Promise.resolve([] as PostRow[])
        : this.prisma.communityPost.findMany({ where: { teacherId, pinnedAt: { not: null } }, orderBy: { pinnedAt: 'desc' }, include }),
      this.prisma.communityPost.findMany({
        where: { teacherId, pinnedAt: null, ...cursorWhere },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include,
      }),
    ]);
    const page = rows.slice(0, limit);
    return {
      pinned: await Promise.all(pinned.map((p) => this.postView(p, viewer, role))),
      items: await Promise.all(page.map((p) => this.postView(p, viewer, role))),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Зураг upload хийх signed URL (`private` bucket). Эцсийн шалгалт (хэмжээ, төрөл) `createPost`-д. */
  async uploadTicket(viewer: CurrentUserInfo, teacherId: string, input: { fileName: string; size: number; contentType: string }): Promise<UploadTicket> {
    await this.role(viewer, teacherId);
    if (input.size > COMMUNITY_IMAGE_MAX_BYTES) throw E.imageTooLarge();
    if (!isImageType(input.contentType)) throw E.invalidImage('Зөвхөн JPG, PNG, WEBP, GIF зураг оруулна.');
    const key = `${imagePrefix(teacherId, viewer.id)}${randomUUID()}${imageExtension(input.contentType)}`;
    const target = await this.storage.createUploadUrl('private', key);
    return { key, ...target };
  }

  async createPost(viewer: CurrentUserInfo, teacherId: string, input: PostInput): Promise<CommunityPostView> {
    const role = await this.role(viewer, teacherId);
    const body = input.body?.trim() ?? '';
    if (!body && !input.imageKey) throw E.emptyPost();
    if (input.imageKey) await this.checkImage(teacherId, viewer.id, input.imageKey);
    const row = await this.prisma.communityPost.create({
      data: { teacherId, authorId: viewer.id, body, imageKey: input.imageKey ?? null },
      include: postInclude(viewer.id),
    });
    return this.postView(row, viewer, role);
  }

  /** Нийтлэлийн текстийг засна — зөвхөн зохиогч (багш/админ ч бусдынхыг засахгүй), нуугдсан бол үгүй. */
  async editPost(viewer: CurrentUserInfo, postId: string, text: string): Promise<CommunityPostView> {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw E.postNotFound();
    const role = await this.role(viewer, post.teacherId);
    if (post.authorId !== viewer.id || post.hiddenAt) throw E.forbidden();
    const body = text.trim();
    if (!body && !post.imageKey) throw E.emptyPost();
    const row = await this.prisma.communityPost.update({
      where: { id: post.id },
      data: body === post.body ? {} : { body, editedAt: new Date() },
      include: postInclude(viewer.id),
    });
    return this.postView(row, viewer, role);
  }

  /** Зохиогч өөрөө, эсвэл багш/админ. Бусдын нийтлэлийг устгавал (модерац) audit log-д. */
  async deletePost(viewer: CurrentUserInfo, postId: string, ip?: string): Promise<void> {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw E.postNotFound();
    const role = await this.role(viewer, post.teacherId);
    const own = post.authorId === viewer.id;
    if (!own && role === 'MEMBER') throw E.forbidden();
    await this.prisma.$transaction(async (tx) => {
      await tx.communityPost.delete({ where: { id: post.id } });
      if (!own) {
        await this.audit.record(tx, {
          actorId: viewer.id,
          action: 'community.post.delete',
          targetType: 'community_post',
          targetId: post.id,
          before: { teacherId: post.teacherId, authorId: post.authorId, body: post.body, imageKey: post.imageKey },
          ip,
        });
      }
    });
    if (post.imageKey) await this.removeImage(post.imageKey);
  }

  /** Pin / болиулах — зөвхөн community-ийн багш. */
  async setPinned(viewer: CurrentUserInfo, postId: string, pinned: boolean): Promise<CommunityPostView> {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, teacherId: true, pinnedAt: true } });
    if (!post) throw E.postNotFound();
    const role = await this.role(viewer, post.teacherId);
    if (role !== 'TEACHER') throw E.teacherOnly();
    if (pinned && !post.pinnedAt) {
      const count = await this.prisma.communityPost.count({ where: { teacherId: post.teacherId, pinnedAt: { not: null } } });
      if (count >= COMMUNITY_PIN_MAX) throw E.pinLimit();
    }
    const row = await this.prisma.communityPost.update({
      where: { id: post.id },
      data: { pinnedAt: pinned ? (post.pinnedAt ?? new Date()) : null },
      include: postInclude(viewer.id),
    });
    return this.postView(row, viewer, role);
  }

  /** Like (idempotent). */
  async setLiked(viewer: CurrentUserInfo, postId: string, liked: boolean): Promise<CommunityLikeState> {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, teacherId: true } });
    if (!post) throw E.postNotFound();
    await this.role(viewer, post.teacherId);
    if (liked) {
      await this.prisma.communityLike.createMany({ data: [{ postId, userId: viewer.id }], skipDuplicates: true });
    } else {
      await this.prisma.communityLike.deleteMany({ where: { postId, userId: viewer.id } });
    }
    return { liked, likeCount: await this.prisma.communityLike.count({ where: { postId } }) };
  }

  // ---- сэтгэгдэл --------------------------------------------------------------

  /** Хуучин нь эхэндээ, `after` cursor-оор. */
  async comments(viewer: CurrentUserInfo, postId: string, opts: { after?: string; limit?: number }): Promise<CommunityCommentPage> {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, teacherId: true } });
    if (!post) throw E.postNotFound();
    const role = await this.role(viewer, post.teacherId);
    const limit = Math.min(opts.limit ?? COMMENT_PAGE_MAX, COMMENT_PAGE_MAX);
    let cursorWhere: Prisma.CommunityCommentWhereInput = {};
    if (opts.after) {
      const cursor = await this.prisma.communityComment.findFirst({ where: { id: opts.after, postId }, select: { id: true, createdAt: true } });
      if (!cursor) throw E.commentNotFound();
      cursorWhere = { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] };
    }
    const rows = await this.prisma.communityComment.findMany({
      where: { postId, ...cursorWhere },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: commentInclude,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((c) => commentView(c, post.teacherId, viewer, role)),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  async addComment(viewer: CurrentUserInfo, postId: string, text: string): Promise<CommunityCommentView> {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, teacherId: true, authorId: true, body: true, hiddenAt: true } });
    if (!post) throw E.postNotFound();
    const role = await this.role(viewer, post.teacherId);
    if (post.hiddenAt) throw E.postHidden();
    const body = text.trim();
    if (!body) throw E.emptyComment();
    const row = await this.prisma.communityComment.create({ data: { postId, authorId: viewer.id, body }, include: commentInclude });
    await this.notifyComment(post, row);
    return commentView(row, post.teacherId, viewer, role);
  }

  /** Сэтгэгдлийг засна — зөвхөн зохиогч, нуугдсан бол үгүй. */
  async editComment(viewer: CurrentUserInfo, commentId: string, text: string): Promise<CommunityCommentView> {
    const comment = await this.prisma.communityComment.findUnique({
      where: { id: commentId },
      include: { ...commentInclude, post: { select: { teacherId: true, hiddenAt: true } } },
    });
    if (!comment) throw E.commentNotFound();
    const role = await this.role(viewer, comment.post.teacherId);
    if (comment.authorId !== viewer.id || comment.hiddenAt) throw E.forbidden();
    if (comment.post.hiddenAt) throw E.postHidden();
    const body = text.trim();
    if (!body) throw E.emptyComment();
    const row = await this.prisma.communityComment.update({
      where: { id: comment.id },
      data: body === comment.body ? {} : { body, editedAt: new Date() },
      include: commentInclude,
    });
    return commentView(row, comment.post.teacherId, viewer, role);
  }

  async deleteComment(viewer: CurrentUserInfo, commentId: string, ip?: string): Promise<void> {
    const comment = await this.prisma.communityComment.findUnique({
      where: { id: commentId },
      include: { post: { select: { teacherId: true } } },
    });
    if (!comment) throw E.commentNotFound();
    const role = await this.role(viewer, comment.post.teacherId);
    const own = comment.authorId === viewer.id;
    if (!own && role === 'MEMBER') throw E.forbidden();
    await this.prisma.$transaction(async (tx) => {
      await tx.communityComment.delete({ where: { id: comment.id } });
      if (!own) {
        await this.audit.record(tx, {
          actorId: viewer.id,
          action: 'community.comment.delete',
          targetType: 'community_comment',
          targetId: comment.id,
          before: { teacherId: comment.post.teacherId, postId: comment.postId, authorId: comment.authorId, body: comment.body },
          ip,
        });
      }
    });
  }

  // ---- багшийн гишүүд ---------------------------------------------------------

  /**
   * Багшийн бүх гишүүн (хасагдсан нь ч, тэмдэглэгээтэй) — анхны эзэмшлийн огноогоор, шинэ нь эхэндээ.
   * Хуудаслалт, эрэмбэ, тоо бүгд SQL-д; entitlement-ээс гаргасан гишүүнчлэлийн загвар хэвээр.
   */
  async members(teacherId: string, opts: { page?: number; limit?: number } = {}): Promise<CommunityMemberPage> {
    const pageSize = Math.min(opts.limit ?? COMMUNITY_MEMBERS_PAGE_SIZE, 100);
    const page = Math.max(opts.page ?? 1, 1);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<
        { id: string; name: string | null; avatar_url: string | null; since: Date; reason: string | null; removed_at: Date | null; removed: boolean }[]
      >(Prisma.sql`
        ${customersCte(teacherId)}
        SELECT cu.user_id AS id, u.name, u.avatar_url, cu.since, r.reason, r.created_at AS removed_at, (r.user_id IS NOT NULL) AS removed
        FROM customers cu
        JOIN users u ON u.id = cu.user_id
        LEFT JOIN community_removals r ON r.teacher_id = ${teacherId}::uuid AND r.user_id = cu.user_id
        ORDER BY cu.since DESC, cu.user_id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        ${customersCte(teacherId)}
        SELECT COUNT(*) AS total FROM customers`),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatar_url,
        since: r.since.toISOString(),
        removed: r.removed ? { reason: r.reason, at: r.removed_at!.toISOString() } : null,
      })),
      total: Number(totals[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  /** Гишүүнийг хасна (lesson-ы эрх нь хэвээр, зөвхөн community). Аль хэдийн хасагдсан бол юу ч өөрчлөхгүй. */
  async removeMember(teacherId: string, userId: string, reason: string | undefined, ip?: string): Promise<void> {
    if (userId === teacherId || !(await ownsAnyLessonOfTeacher(this.prisma, userId, teacherId))) throw E.memberNotFound();
    let removedReason: string | null | undefined;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.communityRemoval.findUnique({ where: { teacherId_userId: { teacherId, userId } } });
      if (existing) return;
      const row = await tx.communityRemoval.create({
        data: { teacherId, userId, reason: reason?.trim() || null, createdById: teacherId },
      });
      await this.audit.record(tx, {
        actorId: teacherId,
        action: 'community.member.remove',
        targetType: 'user',
        targetId: userId,
        after: { teacherId, reason: row.reason },
        ip,
      });
      removedReason = row.reason;
    });
    // Зөвхөн шинээр хасагдсан үед (давтан дуудлагад дахин мэдэгдэхгүй)
    if (removedReason !== undefined) await this.notifyMembership(teacherId, userId, 'COMMUNITY_MEMBER_REMOVED', removedReason);
  }

  async restoreMember(teacherId: string, userId: string, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.communityRemoval.findUnique({ where: { teacherId_userId: { teacherId, userId } } });
      if (!existing) throw E.memberNotFound();
      await tx.communityRemoval.delete({ where: { teacherId_userId: { teacherId, userId } } });
      await this.audit.record(tx, {
        actorId: teacherId,
        action: 'community.member.restore',
        targetType: 'user',
        targetId: userId,
        before: { teacherId, reason: existing.reason },
        ip,
      });
    });
    await this.notifyMembership(teacherId, userId, 'COMMUNITY_MEMBER_RESTORED', null);
  }

  // ---- админы moderation ------------------------------------------------------

  /** Бүх community-ийн сүүлийн нийтлэл/сэтгэгдэл (шинэ нь эхэндээ), `before` cursor-оор. */
  async adminList(opts: { kind: 'post' | 'comment'; status: 'ALL' | 'VISIBLE' | 'HIDDEN'; limit: number; before?: string }): Promise<AdminCommunityPage> {
    const hidden = opts.status === 'ALL' ? {} : opts.status === 'HIDDEN' ? { hiddenAt: { not: null } } : { hiddenAt: null };
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const cursorOf = async () => {
      if (!opts.before) return {};
      const cursor =
        opts.kind === 'post'
          ? await this.prisma.communityPost.findUnique({ where: { id: opts.before }, select: { id: true, createdAt: true } })
          : await this.prisma.communityComment.findUnique({ where: { id: opts.before }, select: { id: true, createdAt: true } });
      if (!cursor) throw opts.kind === 'post' ? E.postNotFound() : E.commentNotFound();
      return { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
    };
    const where = { ...hidden, ...(await cursorOf()) };
    if (opts.kind === 'post') {
      const rows = await this.prisma.communityPost.findMany({ where, orderBy, take: opts.limit + 1, include: adminPostInclude });
      const page = rows.slice(0, opts.limit);
      return { items: page.map(adminPostItem), nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null };
    }
    const rows = await this.prisma.communityComment.findMany({ where, orderBy, take: opts.limit + 1, include: adminCommentInclude });
    const page = rows.slice(0, opts.limit);
    return { items: page.map(adminCommentItem), nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null };
  }

  /** Нуух (шалтгаантай, audit-тай). Аль хэдийн нуусан бол 409. */
  async adminHide(kind: 'post' | 'comment', id: string, adminId: string, reason: string, ip?: string): Promise<AdminCommunityItem> {
    const found: HiddenTarget = { authorId: '', teacherId: '', postId: '' };
    const item = await this.adminSetHidden(kind, id, adminId, reason, ip, found);
    await this.notifyHidden(kind, found, adminId, reason);
    return item;
  }

  adminUnhide(kind: 'post' | 'comment', id: string, adminId: string, ip?: string): Promise<AdminCommunityItem> {
    return this.adminSetHidden(kind, id, adminId, null, ip);
  }

  private adminSetHidden(
    kind: 'post' | 'comment',
    id: string,
    adminId: string,
    reason: string | null,
    ip?: string,
    found?: HiddenTarget,
  ): Promise<AdminCommunityItem> {
    const hiding = reason !== null;
    const data = hiding ? { hiddenAt: new Date(), hiddenById: adminId, hiddenReason: reason } : { hiddenAt: null, hiddenById: null, hiddenReason: null };
    const action = `community.${kind}.${hiding ? 'hide' : 'unhide'}`;
    return this.prisma.$transaction(async (tx) => {
      if (kind === 'post') {
        const before = await tx.communityPost.findUnique({ where: { id } });
        if (!before) throw E.postNotFound();
        if (hiding === !!before.hiddenAt) throw hiding ? E.alreadyHidden() : E.notHidden();
        if (found) Object.assign(found, { authorId: before.authorId, teacherId: before.teacherId, postId: before.id });
        const row = await tx.communityPost.update({ where: { id }, data, include: adminPostInclude });
        await this.audit.record(tx, {
          actorId: adminId,
          action,
          targetType: 'community_post',
          targetId: id,
          before: { teacherId: before.teacherId, authorId: before.authorId, hiddenReason: before.hiddenReason },
          after: { reason },
          ip,
        });
        return adminPostItem(row);
      }
      const before = await tx.communityComment.findUnique({ where: { id } });
      if (!before) throw E.commentNotFound();
      if (hiding === !!before.hiddenAt) throw hiding ? E.alreadyHidden() : E.notHidden();
      if (found) {
        const parent = await tx.communityPost.findUnique({ where: { id: before.postId }, select: { teacherId: true } });
        Object.assign(found, { authorId: before.authorId, teacherId: parent?.teacherId ?? '', postId: before.postId });
      }
      const row = await tx.communityComment.update({ where: { id }, data, include: adminCommentInclude });
      await this.audit.record(tx, {
        actorId: adminId,
        action,
        targetType: 'community_comment',
        targetId: id,
        before: { authorId: before.authorId, hiddenReason: before.hiddenReason },
        after: { reason },
        ip,
      });
      return adminCommentItem(row);
    });
  }

  /** Админ устгах (шалтгаан заавал, audit-д агуулгын хамт). Нийтлэлийн зургийг storage-оос устгана. */
  async adminDelete(kind: 'post' | 'comment', id: string, adminId: string, reason: string, ip?: string): Promise<void> {
    let imageKey: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      if (kind === 'post') {
        const post = await tx.communityPost.findUnique({ where: { id } });
        if (!post) throw E.postNotFound();
        await tx.communityPost.delete({ where: { id } });
        await this.audit.record(tx, {
          actorId: adminId,
          action: 'community.post.delete',
          targetType: 'community_post',
          targetId: id,
          before: { teacherId: post.teacherId, authorId: post.authorId, body: post.body, imageKey: post.imageKey },
          after: { reason, by: 'admin-moderation' },
          ip,
        });
        imageKey = post.imageKey;
        return;
      }
      const c = await tx.communityComment.findUnique({ where: { id }, include: { post: { select: { teacherId: true } } } });
      if (!c) throw E.commentNotFound();
      await tx.communityComment.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'community.comment.delete',
        targetType: 'community_comment',
        targetId: id,
        before: { teacherId: c.post.teacherId, postId: c.postId, authorId: c.authorId, body: c.body },
        after: { reason, by: 'admin-moderation' },
        ip,
      });
    });
    if (imageKey) await this.removeImage(imageKey);
  }

  // ---- дотоод ----------------------------------------------------------------

  private async postView(p: PostRow, viewer: CurrentUserInfo, role: CommunityRole): Promise<CommunityPostView> {
    // Нуусан агуулгыг энгийн гишүүнд өгөхгүй (багш, админ модерацийн тулд харна)
    const masked = p.hiddenAt !== null && role === 'MEMBER';
    return {
      id: p.id,
      author: person(p.author, p.teacherId),
      body: masked ? '' : p.body,
      imageUrl: p.imageKey && !masked ? await this.storage.signedDownloadUrl('private', p.imageKey, COMMUNITY_IMAGE_URL_TTL) : null,
      pinned: p.pinnedAt !== null,
      likeCount: p._count.likes,
      likedByMe: p.likes.length > 0,
      commentCount: p._count.comments,
      canDelete: p.authorId === viewer.id || role !== 'MEMBER',
      canEdit: p.authorId === viewer.id && p.hiddenAt === null,
      createdAt: p.createdAt.toISOString(),
      editedAt: p.editedAt?.toISOString() ?? null,
      hidden: p.hiddenAt !== null,
      hiddenReason: p.hiddenAt !== null ? p.hiddenReason : null,
    };
  }

  /** Агуулгыг нуухад зохиогчид мэдэгдэл (өөрийнхийг нуувал үгүй). Алдаа үйлдлийг унагахгүй. */
  private async notifyHidden(kind: 'post' | 'comment', item: HiddenTarget, moderatorId: string, reason: string): Promise<void> {
    if (!item.authorId || item.authorId === moderatorId) return;
    try {
      await this.notifications.notify({
        userId: item.authorId,
        type: 'COMMUNITY_CONTENT_HIDDEN',
        params: { what: kind === 'post' ? 'нийтлэл' : 'сэтгэгдэл', reason },
        link: `/communities/${item.teacherId}?post=${item.postId}`,
      });
    } catch (err) {
      this.log.error(`Community нуултын мэдэгдэл илгээж чадсангүй (${item.authorId}): ${(err as Error).message}`);
    }
  }

  /** Хасагдсан / сэргээгдсэн гишүүнд мэдэгдэл. Алдаа үйлдлийг унагахгүй. */
  private async notifyMembership(
    teacherId: string,
    userId: string,
    type: 'COMMUNITY_MEMBER_REMOVED' | 'COMMUNITY_MEMBER_RESTORED',
    reason: string | null,
  ): Promise<void> {
    try {
      const teacher = await this.prisma.user.findUniqueOrThrow({ where: { id: teacherId }, select: teacherSelect });
      await this.notifications.notify({
        userId,
        type,
        params: { teacher: teacherRef(teacher).name ?? '', reasonText: reason ? ` Шалтгаан: ${reason}.` : '' },
        link: `/communities/${teacherId}`,
      });
    } catch (err) {
      this.log.error(`Community гишүүнчлэлийн мэдэгдэл илгээж чадсангүй (${userId}): ${(err as Error).message}`);
    }
  }

  private async checkImage(teacherId: string, userId: string, key: string): Promise<void> {
    if (!key.startsWith(imagePrefix(teacherId, userId))) throw E.invalidImage('Зургийн зам буруу.');
    const info = await this.storage.info('private', key);
    if (!info) throw E.invalidImage('Зураг upload хийгдээгүй байна.');
    if (info.size > COMMUNITY_IMAGE_MAX_BYTES || !isImageType(info.contentType)) {
      await this.storage.remove('private', key);
      throw info.size > COMMUNITY_IMAGE_MAX_BYTES ? E.imageTooLarge() : E.invalidImage('Зөвхөн JPG, PNG, WEBP, GIF зураг оруулна.');
    }
  }

  private async removeImage(key: string): Promise<void> {
    try {
      await this.storage.remove('private', key);
    } catch (err) {
      this.log.warn(`Community зураг устгаж чадсангүй (${key}): ${(err as Error).message}`);
    }
  }

  /**
   * Шинэ сэтгэгдлийн мэдэгдэл: нийтлэлийн зохиогч (`COMMUNITY_POST_COMMENT`) + өмнө сэтгэгдэл бичсэн оролцогчид
   * (`COMMUNITY_THREAD_COMMENT`). Сэтгэгдэл бичигч өөрт нь болон хасагдсан хэрэглэгчдэд очихгүй.
   * Мэдэгдлийн алдаа сэтгэгдлийг унагахгүй.
   */
  private async notifyComment(post: { id: string; teacherId: string; authorId: string; body: string }, comment: CommentRow): Promise<void> {
    try {
      const [participants, removals, teacher] = await Promise.all([
        this.prisma.communityComment.findMany({
          where: { postId: post.id, authorId: { notIn: [comment.authorId, post.authorId] } },
          distinct: ['authorId'],
          orderBy: { createdAt: 'desc' },
          take: COMMENT_NOTIFY_MAX,
          select: { authorId: true },
        }),
        this.prisma.communityRemoval.findMany({ where: { teacherId: post.teacherId }, select: { userId: true } }),
        this.prisma.user.findUniqueOrThrow({ where: { id: post.teacherId }, select: teacherSelect }),
      ]);
      const removed = new Set(removals.map((r) => r.userId));
      const params = {
        name: person(comment.author, post.teacherId).name ?? 'Гишүүн',
        teacher: teacherRef(teacher).name ?? '',
        post: excerpt(post.body),
        comment: excerpt(comment.body),
      };
      const link = `/communities/${post.teacherId}?post=${post.id}`;
      const targets: { userId: string; type: 'COMMUNITY_POST_COMMENT' | 'COMMUNITY_THREAD_COMMENT' }[] = [];
      if (post.authorId !== comment.authorId) targets.push({ userId: post.authorId, type: 'COMMUNITY_POST_COMMENT' });
      for (const p of participants) targets.push({ userId: p.authorId, type: 'COMMUNITY_THREAD_COMMENT' });
      for (const target of targets) {
        if (removed.has(target.userId)) continue;
        try {
          await this.notifications.notify({ ...target, params, link });
        } catch (err) {
          this.log.error(`Community мэдэгдэл илгээж чадсангүй (${target.userId}): ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.log.error(`Community мэдэгдлийн хүлээн авагчдыг тодорхойлж чадсангүй: ${(err as Error).message}`);
    }
  }
}

function person(u: AuthorRow, teacherId: string): CommunityPerson & { isTeacher: boolean } {
  const isTeacher = u.id === teacherId;
  if (isTeacher) return { ...teacherRef(u), isTeacher };
  return { id: u.id, name: u.name, avatarUrl: u.avatarUrl, isTeacher };
}

function commentView(c: CommentRow, teacherId: string, viewer: CurrentUserInfo, role: CommunityRole): CommunityCommentView {
  return {
    id: c.id,
    author: person(c.author, teacherId),
    body: c.hiddenAt !== null && role === 'MEMBER' ? '' : c.body,
    canDelete: c.authorId === viewer.id || role !== 'MEMBER',
    canEdit: c.authorId === viewer.id && c.hiddenAt === null,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    hidden: c.hiddenAt !== null,
    hiddenReason: c.hiddenAt !== null ? c.hiddenReason : null,
  };
}

/** Багшийн гишүүд (lesson эсвэл бүтэн курс эзэмшигч) → анхны эзэмшлийн огноо. `purchases/entitlements.ts: teacherCustomers`-ийн SQL хувилбар. */
function customersCte(teacherId: string): Prisma.Sql {
  return Prisma.sql`
    WITH customers AS (
      SELECT user_id, MIN(created_at) AS since FROM (
        SELECT e.user_id, e.created_at FROM entitlements e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = ${teacherId}::uuid
        UNION ALL
        SELECT ce.user_id, ce.created_at FROM course_entitlements ce JOIN courses c ON c.id = ce.course_id WHERE c.teacher_id = ${teacherId}::uuid
      ) owned GROUP BY user_id
    )`;
}

const plainUser = { select: { id: true, name: true, avatarUrl: true } } as const;
const hiderUser = { select: { id: true, name: true } } as const;
const adminPostInclude = { teacher: plainUser, author: plainUser, hiddenBy: hiderUser } as const satisfies Prisma.CommunityPostInclude;
const adminCommentInclude = {
  author: plainUser,
  hiddenBy: hiderUser,
  post: { select: { teacher: plainUser } },
} as const satisfies Prisma.CommunityCommentInclude;

function adminHidden(r: { hiddenAt: Date | null; hiddenReason: string | null; hiddenBy: { id: string; name: string | null } | null }) {
  return r.hiddenAt ? { reason: r.hiddenReason, at: r.hiddenAt.toISOString(), by: r.hiddenBy } : null;
}

function adminPostItem(p: Prisma.CommunityPostGetPayload<{ include: typeof adminPostInclude }>): AdminCommunityItem {
  return {
    kind: 'post',
    id: p.id,
    teacher: p.teacher,
    author: p.author,
    body: p.body,
    hasImage: p.imageKey !== null,
    postId: p.id,
    createdAt: p.createdAt.toISOString(),
    editedAt: p.editedAt?.toISOString() ?? null,
    hidden: adminHidden(p),
  };
}

function adminCommentItem(c: Prisma.CommunityCommentGetPayload<{ include: typeof adminCommentInclude }>): AdminCommunityItem {
  return {
    kind: 'comment',
    id: c.id,
    teacher: c.post.teacher,
    author: c.author,
    body: c.body,
    hasImage: false,
    postId: c.postId,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    hidden: adminHidden(c),
  };
}

function imagePrefix(teacherId: string, userId: string): string {
  return `community/${teacherId}/${userId}/`;
}

function isImageType(contentType: string): boolean {
  return (COMMUNITY_IMAGE_TYPES as readonly string[]).includes(contentType.toLowerCase());
}

function imageExtension(contentType: string): string {
  const sub = contentType.toLowerCase().split('/')[1] ?? '';
  return `.${sub === 'jpeg' ? 'jpg' : sub}`;
}

/** Мэдэгдэлд: эхний мөр, ≤ 80 тэмдэгт; хоосон (зөвхөн зурагтай) бол "зураг". */
function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return 'зураг';
  return line.length > EXCERPT_LENGTH ? `${line.slice(0, EXCERPT_LENGTH - 1)}…` : line;
}
