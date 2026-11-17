import { Injectable } from '@nestjs/common';
import type { Role } from '@lms/db';
import type { LessonAccessReason } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ownsLesson } from '../purchases/entitlements';

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
}
