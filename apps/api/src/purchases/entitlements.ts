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

/**
 * Курсийг БҮТНЭЭР нь авсан эсэх (`CourseEntitlement`) — сертификат (ticket 15) зөвхөн үүнийг шаардана:
 * lesson-уудыг ширхэгээр бүгдийг нь авсан ч бүтэн эзэмшилд тооцогдохгүй.
 */
export async function ownsFullCourse(db: Db, userId: string, courseId: string): Promise<boolean> {
  const row = await db.courseEntitlement.findUnique({ where: { userId_courseId: { userId, courseId } }, select: { id: true } });
  return row !== null;
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
export function ownsFrom(o: Pick<CourseOwnership, 'ownsCourse' | 'lessonIds'>, lessonId: string): boolean {
  return o.ownsCourse || o.lessonIds.has(lessonId);
}

export interface OwnedCourse {
  ownsCourse: boolean;
  /** `Entitlement` мөртэй lesson-ууд */
  lessonIds: Set<string>;
  /** Анхны эзэмшил үүссэн огноо */
  since: Date;
}

/**
 * Хэрэглэгчийн эзэмшиж буй (lesson эсвэл бүтэн) бүх курс — "Миний сургалт" (ticket 12). Тухайн курсийн
 * lesson-ы эзэмшлийг `ownsFrom(owned, lessonId)`-ээр шалгана.
 */
export async function ownedCourses(db: Db, userId: string, courseId?: string): Promise<Map<string, OwnedCourse>> {
  const [lessons, courses] = await Promise.all([
    db.entitlement.findMany({ where: { userId, courseId }, select: { courseId: true, lessonId: true, createdAt: true } }),
    db.courseEntitlement.findMany({ where: { userId, courseId }, select: { courseId: true, createdAt: true } }),
  ]);
  const map = new Map<string, OwnedCourse>();
  const entry = (id: string, at: Date) => {
    let e = map.get(id);
    if (!e) map.set(id, (e = { ownsCourse: false, lessonIds: new Set(), since: at }));
    if (at < e.since) e.since = at;
    return e;
  };
  for (const l of lessons) entry(l.courseId, l.createdAt).lessonIds.add(l.lessonId);
  for (const c of courses) entry(c.courseId, c.createdAt).ownsCourse = true;
  return map;
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

// ---- багшийн түвшний эзэмшил (community, ticket 19) ---------------------------------------------

/** Тухайн багшийн (аль ч курсийн) ямар нэг lesson-ыг эзэмшдэг эсэх — community-ийн гишүүнчлэлийн нөхцөл. */
export async function ownsAnyLessonOfTeacher(db: Db, userId: string, teacherId: string): Promise<boolean> {
  const [lessonRow, courseRow] = await Promise.all([
    db.entitlement.findFirst({ where: { userId, course: { teacherId } }, select: { id: true } }),
    db.courseEntitlement.findFirst({ where: { userId, course: { teacherId } }, select: { id: true } }),
  ]);
  return lessonRow !== null || courseRow !== null;
}

/** Хэрэглэгчийн ямар нэг lesson-ыг нь эзэмшдэг багш нар (давхардалгүй). */
export async function teachersOwnedBy(db: Db, userId: string): Promise<string[]> {
  const [lessons, courses] = await Promise.all([
    db.entitlement.findMany({ where: { userId }, distinct: ['courseId'], select: { course: { select: { teacherId: true } } } }),
    db.courseEntitlement.findMany({ where: { userId }, select: { course: { select: { teacherId: true } } } }),
  ]);
  return [...new Set([...lessons, ...courses].map((r) => r.course.teacherId))];
}

/** Багшийн ямар нэг lesson эзэмшдэг бүх хэрэглэгч → анхны эзэмшлийн огноо. */
export async function teacherCustomers(db: Db, teacherId: string): Promise<Map<string, Date>> {
  const where = { course: { teacherId } };
  const [lessons, courses] = await Promise.all([
    db.entitlement.groupBy({ by: ['userId'], where, _min: { createdAt: true } }),
    db.courseEntitlement.groupBy({ by: ['userId'], where, _min: { createdAt: true } }),
  ]);
  const map = new Map<string, Date>();
  for (const r of [...lessons, ...courses]) {
    const at = r._min.createdAt!;
    const prev = map.get(r.userId);
    if (!prev || at < prev) map.set(r.userId, at);
  }
  return map;
}
