import { HttpStatus, Injectable } from '@nestjs/common';
import type { CourseGrantOrgView, OrgCourseGrantView, PrivateCourseOption } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { ApiError } from '../auth/errors';
import { PrismaService } from '../prisma/prisma.service';

const notFound = (what: string) => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} олдсонгүй.`);
const onlyPrivate = () =>
  new ApiError(HttpStatus.BAD_REQUEST, 'COURSE_NOT_PRIVATE', 'Байгууллагад зөвхөн хаалттай (private) курс олгоно.');

/**
 * Private курсийг байгууллагад олгох/хасах (ticket 46). Эрх нь `org-access.ts`-ийн динамик дүрмээр тооцогдох тул
 * grant мөрийг нэмэх/устгах нь шууд нөлөөлнө — өөр юу ч шинэчлэхгүй. Өөрчлөлт бүр audit log-той нэг transaction-д.
 */
@Injectable()
export class CourseGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Idempotent: аль хэдийн олгосон бол өөрчлөлтгүй, audit ч бичихгүй. */
  async grant(organizationId: string, courseId: string, actorId: string, ip?: string): Promise<OrgCourseGrantView> {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!org) throw notFound('Байгууллага');
      const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, status: true, visibility: true } });
      if (!course) throw notFound('Курс');
      if (course.visibility !== 'PRIVATE') throw onlyPrivate();

      const existing = await tx.organizationCourseGrant.findUnique({
        where: { organizationId_courseId: { organizationId, courseId } },
      });
      if (existing) return { courseId, title: course.title, status: course.status, grantedAt: existing.createdAt.toISOString() };

      const row = await tx.organizationCourseGrant.create({ data: { organizationId, courseId } });
      await this.audit.record(tx, {
        actorId,
        action: 'org.course.grant',
        targetType: 'organization',
        targetId: organizationId,
        after: { courseId, courseTitle: course.title },
        ip,
      });
      return { courseId, title: course.title, status: course.status, grantedAt: row.createdAt.toISOString() };
    });
  }

  /** Idempotent: олгоогүй бол юу ч хийхгүй. */
  async revoke(organizationId: string, courseId: string, actorId: string, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!org) throw notFound('Байгууллага');
      const { count } = await tx.organizationCourseGrant.deleteMany({ where: { organizationId, courseId } });
      if (count === 0) return;
      await this.audit.record(tx, {
        actorId,
        action: 'org.course.revoke',
        targetType: 'organization',
        targetId: organizationId,
        before: { courseId },
        ip,
      });
    });
  }

  async listForOrganization(organizationId: string): Promise<OrgCourseGrantView[]> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw notFound('Байгууллага');
    const rows = await this.prisma.organizationCourseGrant.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { course: { select: { title: true, status: true } } },
    });
    return rows.map((r) => ({ courseId: r.courseId, title: r.course.title, status: r.course.status, grantedAt: r.createdAt.toISOString() }));
  }

  async listForCourse(courseId: string): Promise<CourseGrantOrgView[]> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw notFound('Курс');
    const rows = await this.prisma.organizationCourseGrant.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { id: true, name: true, active: true, contractEndsAt: true } } },
    });
    return rows.map((r) => ({
      organizationId: r.organization.id,
      name: r.organization.name,
      active: r.organization.active,
      contractEndsAt: r.organization.contractEndsAt.toISOString(),
      grantedAt: r.createdAt.toISOString(),
    }));
  }

  /** Олгох сонголтод: бүх PRIVATE курс (шинэ нь эхэнд). */
  async listPrivateCourses(): Promise<PrivateCourseOption[]> {
    return this.prisma.course.findMany({
      where: { visibility: 'PRIVATE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true },
    });
  }
}
