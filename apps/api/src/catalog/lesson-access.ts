import { Injectable } from '@nestjs/common';
import type { CourseVisibility, Lesson, Role } from '@lms/db';
import type { LessonAccessReason } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hasOrgCourseAccess } from '../organizations/org-access';
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

export type OpenedLesson = Lesson & { course: { id: string; title: string; teacherId: string; visibility: CourseVisibility } };

/**
 * Курсийн ажилтны эрх: админ бүх курсийг, багш өөрийн курсийг худалдан авалтгүй үзэж, удирдана.
 * Энэ дүрмийг (lesson контент, viewer state, playback, даалгаврын файл) ЗӨВХӨН эндээс уншина.
 */
export function staffRole(viewer: LessonViewer | null, teacherId: string): 'ADMIN' | 'TEACHER' | null {
  if (!viewer) return null;
  if (viewer.roles.includes('ADMIN')) return 'ADMIN';
  return teacherId === viewer.id ? 'TEACHER' : null;
}

/**
 * Lesson-ы контентыг (текст, PDF signed URL, Mux token, live линк, quiz асуулт …) хэн үзэж болох —
 * ЦОРЫН ГАНЦ шалгалт. SPEC: "контент зөвхөн entitlement эсвэл free preview байгаа үед гарна";
 * "багш өөрийн курсийг, админ бүх курсийг үзнэ".
 *
 * Дараалал: админ → курсийн багш → эзэмшил (lesson эсвэл бүтэн курсийн entitlement) →
 * байгууллагын эрх (идэвхтэй байгууллагын идэвхтэй гишүүн ∧ grant; `Entitlement` мөргүй, динамик — ticket 44) → free preview.
 * `null` = эрхгүй.
 */
@Injectable()
export class LessonAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async access(lesson: LessonAccessSubject, viewer: LessonViewer | null): Promise<LessonAccessReason | null> {
    const staff = staffRole(viewer, lesson.course.teacherId);
    if (staff) return staff;
    if (viewer && (await ownsLesson(this.prisma, viewer.id, lesson))) return 'OWNED';
    if (viewer && (await hasOrgCourseAccess(this.prisma, viewer.id, lesson.courseId))) return 'ORG';
    return lesson.isFreePreview ? 'PREVIEW' : null;
  }

  async canViewContent(lesson: LessonAccessSubject, viewer: LessonViewer | null): Promise<boolean> {
    return (await this.access(lesson, viewer)) !== null;
  }

  /**
   * Learner-т нээгдэх lesson-ыг ачаалж эрхийг шалгана (контент, явц, quiz бүгд үүгээр):
   * шалгагдсан (APPROVED) + нийтлэгдсэн курс, үгүй бол 404. Архивласан lesson нийтэд байхгүй мэт (preview,
   * байгууллагын эрх ч) — эзэмшигч, багш, админд л. Эрхгүй бол 403 `LESSON_LOCKED`; харин PRIVATE курсийн lesson
   * эрхгүй хүнд 404 (курс оршин буйг ч илчлэхгүй).
   */
  async open(lessonId: string, viewer: LessonViewer | null): Promise<{ lesson: OpenedLesson; access: LessonAccessReason }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, reviewStatus: 'APPROVED', course: { status: 'PUBLISHED' } },
      include: { course: { select: { id: true, title: true, teacherId: true, visibility: true } } },
    });
    if (!lesson) throw E.lessonNotFound();
    const access = await this.access(lesson, viewer);
    if (lesson.archivedAt && (access === null || access === 'PREVIEW' || access === 'ORG')) throw E.lessonNotFound();
    if (!access && lesson.course.visibility === 'PRIVATE') throw E.lessonNotFound();
    if (!access) throw E.lessonLocked();
    return { lesson, access };
  }
}
