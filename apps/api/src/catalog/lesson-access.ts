import { Injectable } from '@nestjs/common';

export interface LessonAccessSubject {
  id: string;
  courseId: string;
  isFreePreview: boolean;
}

/**
 * Lesson-ы контентыг (текст, PDF signed URL, …) хэн үзэж болох — суралцагч талын ЦОРЫН ГАНЦ шалгалт.
 * SPEC: "контент зөвхөн entitlement эсвэл free preview байгаа үед гарна".
 *
 * Одоогоор зөвхөн free preview. Ticket 09 (худалдан авалт): `viewerId`-ийн entitlement-ийг
 * (lesson эсвэл бүтэн курс) энд шалгана; controller `viewerId`-г optional auth-аас дамжуулна.
 */
@Injectable()
export class LessonAccessPolicy {
  async canViewContent(lesson: LessonAccessSubject, viewerId: string | null): Promise<boolean> {
    void viewerId;
    return lesson.isFreePreview;
  }
}
