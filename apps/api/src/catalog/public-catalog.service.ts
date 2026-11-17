import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@lms/db';
import {
  CATALOG_PAGE_SIZE,
  type CatalogCourseCard,
  type CatalogPage,
  type CatalogQuery,
  type CoursePricing,
  type PublicCategoryRef,
  type PublicCourseDetail,
  type PublicLessonContent,
  type PublicLessonItem,
  type PublicTeacherProfile,
  type PublicTeacherRef,
} from '@lms/shared';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { PrismaService } from '../prisma/prisma.service';
import { searchCatalog } from './catalog-search';
import { toContent } from './course.view';
import { CatalogErrors as E } from './errors';
import { LessonAccessPolicy } from './lesson-access';
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
  lessons: { where: publicLessonWhere, select: { isFreePreview: true, priceCredits: true } },
} as const satisfies Prisma.CourseInclude;

type TeacherRow = Prisma.UserGetPayload<{ select: typeof teacherSelect }>;
type CardRow = Prisma.CourseGetPayload<{ include: typeof cardInclude }>;

/**
 * Нийтийн (нэвтрэлтгүй) каталог. Дүрэм:
 * - Зөвхөн `PUBLISHED` курс; бусад төлөвийнх 404 (оршин буйг ч илчлэхгүй).
 * - Зөвхөн `APPROVED`, архивлаагүй lesson (шалгалт хүлээж буй шинэ lesson харагдахгүй).
 * - Lesson-ы контент зөвхөн `LessonAccessPolicy` зөвшөөрвөл (одоогоор free preview).
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

  async course(id: string): Promise<PublicCourseDetail> {
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
    const ratings = await loadRatings([course.id]);
    const { excerpt: _excerpt, teacher, ...card } = this.card(course, ratings.get(course.id));
    void _excerpt;
    return {
      ...card,
      description: course.description,
      teacher: { ...teacher, bio: publicBio(course.teacher) },
      pricing: this.pricing(course, null),
      sections: course.sections
        .map((s) => ({ id: s.id, title: s.title, lessons: s.lessons.map(lessonItem) }))
        .filter((s) => s.lessons.length > 0),
    };
  }

  /** Lesson-ы контент — эрх `LessonAccessPolicy`-оор. Нийтэд харагдахгүй lesson 404, эрхгүй бол 403. */
  async lesson(id: string, viewerId: string | null): Promise<PublicLessonContent> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, ...publicLessonWhere, course: { status: 'PUBLISHED' } },
      include: { course: { select: { id: true, title: true } } },
    });
    if (!lesson) throw E.lessonNotFound();
    if (!(await this.access.canViewContent(lesson, viewerId))) throw E.lessonLocked();
    return {
      lesson: lessonItem(lesson),
      course: lesson.course,
      content: await toContent(lesson, this.storage, PREVIEW_PDF_TTL),
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
   * Ticket 09: `viewerId`-ийн энэ курст зарцуулсан кредитийг хасна (controller optional auth-аас өгнө).
   */
  private pricing(course: CardRow, viewerId: string | null): CoursePricing {
    void viewerId;
    const list = course.priceCredits ?? 0;
    const alreadySpent = 0;
    return {
      listCredits: list,
      lessonsTotalCredits: course.lessons.reduce((sum, l) => sum + l.priceCredits, 0),
      payableCredits: Math.max(0, list - alreadySpent),
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

function lessonItem(l: { id: string; title: string; type: PublicLessonItem['type']; priceCredits: number; isFreePreview: boolean }): PublicLessonItem {
  return { id: l.id, title: l.title, type: l.type, priceCredits: l.priceCredits, isFreePreview: l.isFreePreview };
}

/** Markdown тэмдэгтгүй, ≤ 200 тэмдэгт */
function excerpt(description: string): string {
  const plain = description
    .replace(/[#*`>[\]()_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 200 ? `${plain.slice(0, 197).trimEnd()}…` : plain;
}
