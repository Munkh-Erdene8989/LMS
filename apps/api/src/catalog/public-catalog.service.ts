import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@lms/db';
import {
  CATALOG_PAGE_SIZE,
  type CatalogCourseCard,
  type CatalogPage,
  type CatalogQuery,
  type CoursePricing,
  type CourseViewerState,
  type PublicCategoryRef,
  type PublicCourseDetail,
  type PublicLessonContent,
  type PublicLessonItem,
  type PublicTeacherProfile,
  type PublicTeacherRef,
} from '@lms/shared';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { PrismaService } from '../prisma/prisma.service';
import { courseOwnership, ownsFrom, type CourseOwnership } from '../purchases/entitlements';
import { searchCatalog } from './catalog-search';
import { toContent } from './course.view';
import { CatalogErrors as E } from './errors';
import { LessonAccessPolicy, type LessonViewer } from './lesson-access';
import type { LiveContent } from './lesson-types';
import { loadRatings, NO_RATING } from './ratings';

/** Free preview PDF-ийн signed URL хүчинтэй хугацаа */
const PREVIEW_PDF_TTL = 5 * 60;
const TEACHER_PROFILE_COURSES = 100;
const FALLBACK_TEACHER_NAME = 'Багш';

/** Нийтэд харагдах lesson — шалгагдсан, архивлаагүй. */
const publicLessonWhere = { reviewStatus: 'APPROVED', archivedAt: null } as const satisfies Prisma.LessonWhereInput;

const teacherSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  teacherApplication: { select: { status: true, displayName: true, bio: true, expertise: true } },
} as const satisfies Prisma.UserSelect;

const cardInclude = {
  teacher: { select: teacherSelect },
  category: { include: { parent: true } },
  lessons: { where: publicLessonWhere, select: { id: true, isFreePreview: true, priceCredits: true } },
} as const satisfies Prisma.CourseInclude;

type TeacherRow = Prisma.UserGetPayload<{ select: typeof teacherSelect }>;
type CardRow = Prisma.CourseGetPayload<{ include: typeof cardInclude }>;

/**
 * Нийтийн (нэвтрэлтгүй) каталог. Дүрэм:
 * - Зөвхөн `PUBLISHED` курс; бусад төлөвийнх 404 (оршин буйг ч илчлэхгүй).
 * - Зөвхөн `APPROVED`, архивлаагүй lesson (шалгалт хүлээж буй шинэ lesson харагдахгүй).
 * - Lesson-ы контент зөвхөн `LessonAccessPolicy` зөвшөөрвөл (preview, эзэмшил, багш, админ).
 * - Архивласан lesson нийтэд 404, харин эзэмшигч (болон багш, админ) контентоо үзсээр байна.
 * - `viewer` (optional auth) өгвөл үнэ хувийн (өмнө төлсөн кредит хасагдсан), эзэмшлийн төлөвтэй.
 * - Багшийн нийтийн нэр, bio: зөвшөөрөгдсөн багшийн өргөдлөөс (`displayName`), үгүй бол хэрэглэгчийн нэр.
 */
@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessPolicy,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async list(query: CatalogQuery): Promise<CatalogPage> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(48, Math.max(1, query.pageSize ?? CATALOG_PAGE_SIZE));
    const categoryIds = query.category ? await this.categoryScope(query.category) : undefined;
    const hits = await searchCatalog(this.prisma, {
      q: query.q,
      categoryIds,
      level: query.level,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
      freePreview: query.freePreview,
      sort: query.sort ?? (query.q?.trim() ? 'relevance' : 'newest'),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items: await this.cards(hits.ids), total: hits.total, page, pageSize };
  }

  async course(id: string, viewer: LessonViewer | null = null): Promise<PublicCourseDetail> {
    const course = await this.prisma.course.findFirst({
      where: { id, status: 'PUBLISHED' },
      include: {
        ...cardInclude,
        sections: {
          orderBy: { position: 'asc' },
          include: { lessons: { where: publicLessonWhere, orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!course) throw E.courseNotFound();
    const [ratings, ownership] = await Promise.all([
      loadRatings([course.id]),
      viewer ? courseOwnership(this.prisma, viewer.id, course.id) : Promise.resolve(null),
    ]);
    const { excerpt: _excerpt, teacher, ...card } = this.card(course, ratings.get(course.id));
    void _excerpt;
    return {
      ...card,
      description: course.description,
      teacher: { ...teacher, bio: publicBio(course.teacher) },
      pricing: this.pricing(course, ownership),
      sections: course.sections
        .map((s) => ({ id: s.id, title: s.title, lessons: s.lessons.map(lessonItem) }))
        .filter((s) => s.lessons.length > 0),
      viewer: viewer && ownership ? viewerState(course, viewer, ownership) : null,
    };
  }

  /** Lesson-ы контент — эрх `LessonAccessPolicy`-оор. Нийтэд харагдахгүй lesson 404, эрхгүй бол 403. */
  async lesson(id: string, viewer: LessonViewer | null): Promise<PublicLessonContent> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, reviewStatus: 'APPROVED', course: { status: 'PUBLISHED' } },
      include: { course: { select: { id: true, title: true, teacherId: true } } },
    });
    if (!lesson) throw E.lessonNotFound();
    const access = await this.access.access(lesson, viewer);
    // Архивласан lesson нийтэд байхгүй мэт (preview ч гэсэн); эзэмшигч, багш, админд л.
    if (lesson.archivedAt && (access === null || access === 'PREVIEW')) throw E.lessonNotFound();
    if (!access) throw E.lessonLocked();
    return {
      lesson: lessonItem(lesson),
      access,
      course: { id: lesson.course.id, title: lesson.course.title },
      // Live линк зөвхөн эзэмшигч, багш, админд — free preview-ээр үзэж буй хүнд биш (ticket 14).
      content: await toContent(lesson, this.storage, PREVIEW_PDF_TTL, { revealMeetingUrl: access !== 'PREVIEW' }),
    };
  }

  async teacher(id: string): Promise<PublicTeacherProfile> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { ...teacherSelect, roles: true } });
    if (!user || !user.roles.includes('TEACHER')) throw E.teacherNotFound();
    const hits = await searchCatalog(this.prisma, {
      teacherId: id,
      sort: 'newest',
      limit: TEACHER_PROFILE_COURSES,
      offset: 0,
    });
    const approved = user.teacherApplication?.status === 'APPROVED' ? user.teacherApplication : null;
    return {
      ...teacherRef(user),
      bio: approved?.bio ?? null,
      expertise: approved?.expertise ?? null,
      courses: await this.cards(hits.ids),
    };
  }

  /**
   * Курсийг бүтнээр авах үнэ. SPEC: max(0, course_price − тухайн курсийн lesson-д аль хэдийн зарцуулсан кредит).
   * Худалдан авалт (`PurchasesService.buyCourse`) ижил томьёог transaction дотор дахин тооцно.
   */
  private pricing(course: CardRow, ownership: CourseOwnership | null): CoursePricing {
    const list = course.priceCredits ?? 0;
    const alreadySpent = ownership?.spentOnLessons ?? 0;
    return {
      listCredits: list,
      lessonsTotalCredits: course.lessons.reduce((sum, l) => sum + l.priceCredits, 0),
      alreadySpentCredits: alreadySpent,
      payableCredits: ownership?.ownsCourse ? 0 : Math.max(0, list - alreadySpent),
    };
  }

  /** slug → тухайн ангилал + (үндсэн бол) дэд ангиллуудын id. Олдохгүй бол хоосон (юу ч олдохгүй). */
  private async categoryScope(slug: string): Promise<string[]> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true, children: { select: { id: true } } },
    });
    return category ? [category.id, ...category.children.map((c) => c.id)] : [];
  }

  private async cards(ids: string[]): Promise<CatalogCourseCard[]> {
    if (ids.length === 0) return [];
    const [rows, ratings] = await Promise.all([
      this.prisma.course.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' }, include: cardInclude }),
      loadRatings(ids),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [this.card(row, ratings.get(id))] : [];
    });
  }

  private card(c: CardRow, rating = NO_RATING): CatalogCourseCard {
    return {
      id: c.id,
      title: c.title,
      excerpt: excerpt(c.description),
      coverUrl: c.coverKey ? this.storage.publicUrl(c.coverKey) : null,
      level: c.level,
      priceCredits: c.priceCredits ?? 0,
      lessonCount: c.lessons.length,
      hasFreePreview: c.lessons.some((l) => l.isFreePreview),
      teacher: teacherRef(c.teacher),
      category: categoryRef(c.category),
      rating,
      publishedAt: (c.publishedAt ?? c.updatedAt).toISOString(),
    };
  }
}

function viewerState(
  course: { teacherId: string; lessons: { id: string }[] },
  viewer: LessonViewer,
  o: CourseOwnership,
): CourseViewerState {
  const isTeacher = course.teacherId === viewer.id;
  return {
    ownsCourse: o.ownsCourse,
    ownedLessonIds: course.lessons.filter((l) => ownsFrom(o, l.id)).map((l) => l.id),
    canViewAll: isTeacher || viewer.roles.includes('ADMIN'),
    isTeacher,
  };
}

function teacherRef(u: TeacherRow): PublicTeacherRef {
  const app = u.teacherApplication?.status === 'APPROVED' ? u.teacherApplication : null;
  return { id: u.id, name: app?.displayName || u.name || FALLBACK_TEACHER_NAME, avatarUrl: u.avatarUrl };
}

function publicBio(u: TeacherRow): string | null {
  return u.teacherApplication?.status === 'APPROVED' ? u.teacherApplication.bio : null;
}

function categoryRef(c: CardRow['category']): PublicCategoryRef | null {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    parent: c.parent ? { id: c.parent.id, name: c.parent.name, slug: c.parent.slug } : null,
  };
}

function lessonItem(l: {
  id: string;
  title: string;
  type: PublicLessonItem['type'];
  priceCredits: number;
  isFreePreview: boolean;
  content: Prisma.JsonValue;
}): PublicLessonItem {
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    priceCredits: l.priceCredits,
    isFreePreview: l.isFreePreview,
    live: l.type === 'LIVE' ? liveSchedule(l.content) : null,
  };
}

/** Live-ийн хуваарь (нийтэд харагдана) — линк орохгүй. */
function liveSchedule(content: Prisma.JsonValue): PublicLessonItem['live'] {
  const c = content as unknown as Partial<LiveContent> | null;
  return { startsAt: c?.startsAt ?? null, durationMinutes: c?.durationMinutes ?? null };
}

/** Markdown тэмдэгтгүй, ≤ 200 тэмдэгт */
function excerpt(description: string): string {
  const plain = description
    .replace(/[#*`>[\]()_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 200 ? `${plain.slice(0, 197).trimEnd()}…` : plain;
}
