import type { Prisma, PrismaClient } from '@lms/db';

/** PrismaService эсвэл transaction client */
export type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Эрхийн (entitlement) уншилт — бусад модуль (каталог, явц 12, сертификат 15, review 18, community 19)
 * эзэмшлийг ЗӨВХӨН эндээс шалгана.
 *
 * Эзэмшил = lesson-ы `Entitlement` мөр, ЭСВЭЛ курсийг бүтнээр авсан `CourseEntitlement` (бүтэн курс авсны
 * дараа зөвшөөрөгдсөн шинэ lesson-ууд мөр нэмэлгүйгээр нээгдэнэ).
 */
export async function ownsLesson(db: Db, userId: string, lesson: { id: string; courseId: string }): Promise<boolean> {
  const [lessonRow, courseRow] = await Promise.all([
    db.entitlement.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } }, select: { id: true } }),
    db.courseEntitlement.findUnique({
      where: { userId_courseId: { userId, courseId: lesson.courseId } },
      select: { id: true },
    }),
  ]);
  return lessonRow !== null || courseRow !== null;
}

export interface CourseOwnership {
  /** Курсийг бүтнээр авсан */
  ownsCourse: boolean;
  /** `Entitlement` мөртэй lesson-ууд (бүтэн курс эзэмшигчид мөргүй шинэ lesson-ууд ч эзэмшилд тооцогдоно) */
  lessonIds: Set<string>;
  /** Энэ курсийн lesson-уудыг ширхэгээр авахад зарцуулсан нийт кредит (курсийн үнээс хасагдана) */
  spentOnLessons: number;
}

export async function courseOwnership(db: Db, userId: string, courseId: string): Promise<CourseOwnership> {
  const [course, lessons, spent] = await Promise.all([
    db.courseEntitlement.findUnique({ where: { userId_courseId: { userId, courseId } }, select: { id: true } }),
    db.entitlement.findMany({ where: { userId, courseId }, select: { lessonId: true } }),
    db.purchase.aggregate({ where: { userId, courseId, kind: 'LESSON' }, _sum: { credits: true } }),
  ]);
  return {
    ownsCourse: course !== null,
    lessonIds: new Set(lessons.map((l) => l.lessonId)),
    spentOnLessons: spent._sum.credits ?? 0,
  };
}

/** Тухайн lesson-ыг эзэмшиж буй эсэх (`courseOwnership`-ийн үр дүнгээс). */
export function ownsFrom(o: CourseOwnership, lessonId: string): boolean {
  return o.ownsCourse || o.lessonIds.has(lessonId);
}

/**
 * Lesson-ыг эзэмшиж буй бүх хэрэглэгч (lesson-ы `Entitlement` ∪ курсийн `CourseEntitlement`) —
 * live сануулга (ticket 14) г.м олон хүнд мэдэгдэл илгээхэд.
 */
export async function lessonOwnerIds(db: Db, lesson: { id: string; courseId: string }): Promise<string[]> {
  const [lessonRows, courseRows] = await Promise.all([
    db.entitlement.findMany({ where: { lessonId: lesson.id }, select: { userId: true } }),
    db.courseEntitlement.findMany({ where: { courseId: lesson.courseId }, select: { userId: true } }),
  ]);
  return [...new Set([...lessonRows, ...courseRows].map((r) => r.userId))];
}
