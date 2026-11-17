import { Injectable } from '@nestjs/common';
import type { Lesson, Role } from '@lms/db';
import type { LessonAccessReason } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ownsLesson } from '../purchases/entitlements';
import { CatalogErrors as E } from './errors';

export interface LessonAccessSubject {
  id: string;
  courseId: string;
  isFreePreview: boolean;
  course: { teacherId: string };
}

export interface LessonViewer {
  id: string;
  roles: Role[];
}

export type OpenedLesson = Lesson & { course: { id: string; title: string; teacherId: string } };

/**
 * Lesson-ы контентыг (текст, PDF signed URL, Mux token, live линк, quiz асуулт …) хэн үзэж болох —
 * ЦОРЫН ГАНЦ шалгалт. SPEC: "контент зөвхөн entitlement эсвэл free preview байгаа үед гарна";
 * "багш өөрийн курсийг, админ бүх курсийг үзнэ".
 *
 * Дараалал: админ → курсийн багш → эзэмшил (lesson эсвэл бүтэн курсийн entitlement) → free preview.
 * `null` = эрхгүй.
 */
@Injectable()
export class LessonAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async access(lesson: LessonAccessSubject, viewer: LessonViewer | null): Promise<LessonAccessReason | null> {
    if (viewer) {
      if (viewer.roles.includes('ADMIN')) return 'ADMIN';
      if (lesson.course.teacherId === viewer.id) return 'TEACHER';
      if (await ownsLesson(this.prisma, viewer.id, lesson)) return 'OWNED';
    }
    return lesson.isFreePreview ? 'PREVIEW' : null;
  }

  async canViewContent(lesson: LessonAccessSubject, viewer: LessonViewer | null): Promise<boolean> {
    return (await this.access(lesson, viewer)) !== null;
  }

  /**
   * Learner-т нээгдэх lesson-ыг ачаалж эрхийг шалгана (контент, явц, quiz бүгд үүгээр):
   * шалгагдсан (APPROVED) + нийтлэгдсэн курс, үгүй бол 404. Архивласан lesson нийтэд байхгүй мэт (preview ч) —
   * эзэмшигч, багш, админд л. Эрхгүй бол 403 `LESSON_LOCKED`.
   */
  async open(lessonId: string, viewer: LessonViewer | null): Promise<{ lesson: OpenedLesson; access: LessonAccessReason }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, reviewStatus: 'APPROVED', course: { status: 'PUBLISHED' } },
      include: { course: { select: { id: true, title: true, teacherId: true } } },
    });
    if (!lesson) throw E.lessonNotFound();
    const access = await this.access(lesson, viewer);
    if (lesson.archivedAt && (access === null || access === 'PREVIEW')) throw E.lessonNotFound();
    if (!access) throw E.lessonLocked();
    return { lesson, access };
  }
}
