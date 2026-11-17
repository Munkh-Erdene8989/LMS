import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@lms/db';
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_IMAGE_TYPES,
  COMMUNITY_PIN_MAX,
  liveEndsAt,
  type CommunityCommentPage,
  type CommunityCommentView,
  type CommunityFeed,
  type CommunityLikeState,
  type CommunityLiveItem,
  type CommunityMember,
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
import { ownedCourses, ownsAnyLessonOfTeacher, ownsFrom, teacherCustomers, teachersOwnedBy } from '../purchases/entitlements';
import { CommunityErrors as E } from './errors';

/** Зургийн signed URL хэр удаан хүчинтэй (хуудас нээлттэй байх хугацаанд). */
export const COMMUNITY_IMAGE_URL_TTL = 60 * 60;
const FEED_PAGE_MAX = 30;
const COMMENT_PAGE_MAX = 100;
const UPCOMING_LIVE_MAX = 20;
/** Нэг сэтгэгдлээр хамгийн ихдээ хэдэн оролцогчид мэдэгдэл очих */
const COMMENT_NOTIFY_MAX = 50;
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

  private async memberCount(teacherId: string): Promise<number> {
    const [customers, removals] = await Promise.all([
      teacherCustomers(this.prisma, teacherId),
      this.prisma.communityRemoval.findMany({ where: { teacherId }, select: { userId: true } }),
    ]);
    return customers.size - removals.filter((r) => customers.has(r.userId)).length;
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
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, teacherId: true, authorId: true, body: true } });
    if (!post) throw E.postNotFound();
    const role = await this.role(viewer, post.teacherId);
    const body = text.trim();
    if (!body) throw E.emptyComment();
    const row = await this.prisma.communityComment.create({ data: { postId, authorId: viewer.id, body }, include: commentInclude });
    await this.notifyComment(post, row);
    return commentView(row, post.teacherId, viewer, role);
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

  /** Багшийн бүх гишүүн (хасагдсан нь ч, тэмдэглэгээтэй) — анхны эзэмшлийн огноогоор, шинэ нь эхэндээ. */
  async members(teacherId: string): Promise<CommunityMember[]> {
    const customers = await teacherCustomers(this.prisma, teacherId);
    const ids = [...customers.keys()];
    const [users, removals] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, avatarUrl: true } }),
      this.prisma.communityRemoval.findMany({ where: { teacherId, userId: { in: ids } } }),
    ]);
    const removedBy = new Map(removals.map((r) => [r.userId, r]));
    return users
      .map((u) => {
        const r = removedBy.get(u.id);
        return {
          id: u.id,
          name: u.name,
          avatarUrl: u.avatarUrl,
          since: customers.get(u.id)!.toISOString(),
          removed: r ? { reason: r.reason, at: r.createdAt.toISOString() } : null,
        };
      })
      .sort((a, b) => b.since.localeCompare(a.since));
  }

  /** Гишүүнийг хасна (lesson-ы эрх нь хэвээр, зөвхөн community). Аль хэдийн хасагдсан бол юу ч өөрчлөхгүй. */
  async removeMember(teacherId: string, userId: string, reason: string | undefined, ip?: string): Promise<void> {
    if (userId === teacherId || !(await ownsAnyLessonOfTeacher(this.prisma, userId, teacherId))) throw E.memberNotFound();
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
    });
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
  }

  // ---- дотоод ----------------------------------------------------------------

  private async postView(p: PostRow, viewer: CurrentUserInfo, role: CommunityRole): Promise<CommunityPostView> {
    return {
      id: p.id,
      author: person(p.author, p.teacherId),
      body: p.body,
      imageUrl: p.imageKey ? await this.storage.signedDownloadUrl('private', p.imageKey, COMMUNITY_IMAGE_URL_TTL) : null,
      pinned: p.pinnedAt !== null,
      likeCount: p._count.likes,
      likedByMe: p.likes.length > 0,
      commentCount: p._count.comments,
      canDelete: p.authorId === viewer.id || role !== 'MEMBER',
      createdAt: p.createdAt.toISOString(),
    };
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
    body: c.body,
    canDelete: c.authorId === viewer.id || role !== 'MEMBER',
    createdAt: c.createdAt.toISOString(),
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
