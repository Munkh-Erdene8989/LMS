import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@lms/db';
import type { CourseDetail, ReviewQueueItem } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { courseDetailInclude, toCourseDetail, toCourseSummary } from './course.view';
import { CatalogErrors as E } from './errors';

/** Хяналтын дараалал: шинэ курс, эсвэл нийтлэгдсэн курсийн шинэ хичээл. Админы тоймын тоо ч үүнийг ашиглана. */
export const REVIEW_QUEUE_WHERE = {
  // PRIVATE курс review-гүй (ticket 44) — дараалалд ч, тоймын тоонд ч орохгүй.
  visibility: 'PUBLIC',
  OR: [
    { status: 'IN_REVIEW' },
    { status: 'PUBLISHED', lessons: { some: { reviewStatus: 'IN_REVIEW', archivedAt: null } } },
  ],
} satisfies Prisma.CourseWhereInput;

/**
 * Админы шалгалт. Хоёр төрөл:
 * - `COURSE`: IN_REVIEW курс — зөвшөөрвөл PUBLISHED, бүх шалгагдаж буй lesson APPROVED.
 * - `LESSONS`: PUBLISHED курсийн шинэ lesson-ууд — курс нийтлэгдсэн хэвээр, lesson-ууд л шийдэгдэнэ.
 * Аль ч тохиолдолд өмнө APPROVED болсон lesson-д хүрэхгүй (худалдан авсан хүмүүсийн эрх хэвээр).
 */
@Injectable()
export class CourseReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async queue(): Promise<ReviewQueueItem[]> {
    const rows = await this.prisma.course.findMany({
      where: REVIEW_QUEUE_WHERE,
      orderBy: { submittedAt: 'asc' },
      include: {
        teacher: { select: { id: true, name: true } },
        lessons: { select: { reviewStatus: true, archivedAt: true } },
      },
    });
    return rows.map((r) => ({
      course: toCourseSummary(r, this.storage),
      teacher: r.teacher,
      kind: r.status === 'IN_REVIEW' ? 'COURSE' : 'LESSONS',
      submittedAt: r.submittedAt?.toISOString() ?? null,
    }));
  }

  /** Админ ямар ч курсийг бүх lesson-ы агуулгатай нь үзнэ. */
  async detail(courseId: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, include: courseDetailInclude });
    if (!course) throw E.courseNotFound();
    return toCourseDetail(course, this.storage);
  }

  async approve(courseId: string, adminId: string, ip?: string): Promise<CourseDetail> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } });
      if (!course) throw E.courseNotFound();
      const pending = await tx.lesson.findMany({
        where: { courseId, reviewStatus: 'IN_REVIEW', archivedAt: null },
        select: { id: true },
      });

      let kind: 'COURSE' | 'LESSONS';
      if (course.status === 'IN_REVIEW') {
        kind = 'COURSE';
        const { count } = await tx.course.updateMany({
          where: { id: courseId, status: 'IN_REVIEW' },
          data: {
            status: 'PUBLISHED',
            publishedAt: course.publishedAt ?? now,
            reviewNote: null,
            reviewedById: adminId,
            reviewedAt: now,
          },
        });
        if (count === 0) throw E.invalidStatus();
      } else if (course.status === 'PUBLISHED' && pending.length > 0) {
        kind = 'LESSONS';
        await tx.course.update({ where: { id: courseId }, data: { reviewedById: adminId, reviewedAt: now } });
      } else {
        throw E.invalidStatus();
      }

      const { count } = await tx.lesson.updateMany({
        where: { id: { in: pending.map((l) => l.id) }, reviewStatus: 'IN_REVIEW' },
        data: { reviewStatus: 'APPROVED', approvedAt: now, reviewNote: null },
      });
      await this.audit.record(tx, {
        actorId: adminId,
        action: kind === 'COURSE' ? 'course.approve' : 'course.lessons.approve',
        targetType: 'course',
        targetId: courseId,
        before: { status: course.status },
        after: { status: 'PUBLISHED', approvedLessons: count },
        ip,
      });
      return { kind, teacherId: course.teacherId, title: course.title, count };
    });

    await this.notifications.notify({
      userId: result.teacherId,
      type: result.kind === 'COURSE' ? 'COURSE_APPROVED' : 'LESSONS_APPROVED',
      params: { title: result.title, count: result.count },
      link: `/teacher/courses/${courseId}`,
    });
    return this.detail(courseId);
  }

  /** Курс (IN_REVIEW) эсвэл нийтлэгдсэн курсийн бүх шинэ lesson-ыг тайлбартай буцаана. */
  async reject(courseId: string, reason: string, adminId: string, ip?: string): Promise<CourseDetail> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } });
      if (!course) throw E.courseNotFound();

      let kind: 'COURSE' | 'LESSONS';
      if (course.status === 'IN_REVIEW') {
        kind = 'COURSE';
        const { count } = await tx.course.updateMany({
          where: { id: courseId, status: 'IN_REVIEW' },
          data: { status: 'REJECTED', reviewNote: reason, reviewedById: adminId, reviewedAt: now },
        });
        if (count === 0) throw E.invalidStatus();
      } else if (course.status === 'PUBLISHED') {
        kind = 'LESSONS';
      } else {
        throw E.invalidStatus();
      }

      const { count } = await tx.lesson.updateMany({
        where: { courseId, reviewStatus: 'IN_REVIEW', archivedAt: null },
        data: { reviewStatus: 'REJECTED', reviewNote: reason },
      });
      if (kind === 'LESSONS' && count === 0) throw E.invalidStatus();
      await this.audit.record(tx, {
        actorId: adminId,
        action: kind === 'COURSE' ? 'course.reject' : 'course.lessons.reject',
        targetType: 'course',
        targetId: courseId,
        before: { status: course.status },
        after: { status: kind === 'COURSE' ? 'REJECTED' : course.status, reason, rejectedLessons: count },
        ip,
      });
      return { kind, teacherId: course.teacherId, title: course.title };
    });

    await this.notifications.notify({
      userId: result.teacherId,
      type: result.kind === 'COURSE' ? 'COURSE_REJECTED' : 'LESSONS_REJECTED',
      params: { title: result.title, reason },
      link: `/teacher/courses/${courseId}`,
    });
    return this.detail(courseId);
  }

  /** Нийтлэгдсэн курсийн нэг шинэ lesson-ыг тайлбартай буцаана (бусад нь хүлээгдсэн хэвээр). */
  async rejectLesson(lessonId: string, reason: string, adminId: string, ip?: string): Promise<CourseDetail> {
    const lesson = await this.prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, include: { course: true } });
      if (!lesson) throw E.lessonNotFound();
      // Курс бүхэлдээ шалгагдаж байх үед курсийн түвшинд л шийдвэрлэнэ.
      if (lesson.course.status !== 'PUBLISHED') throw E.invalidStatus();
      const { count } = await tx.lesson.updateMany({
        where: { id: lessonId, reviewStatus: 'IN_REVIEW' },
        data: { reviewStatus: 'REJECTED', reviewNote: reason },
      });
      if (count === 0) throw E.invalidStatus();
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'lesson.reject',
        targetType: 'lesson',
        targetId: lessonId,
        after: { reason },
        ip,
      });
      return lesson;
    });
    await this.notifications.notify({
      userId: lesson.course.teacherId,
      type: 'LESSONS_REJECTED',
      params: { title: `${lesson.course.title} — ${lesson.title}`, reason },
      link: `/teacher/courses/${lesson.courseId}`,
    });
    return this.detail(lesson.courseId);
  }
}
