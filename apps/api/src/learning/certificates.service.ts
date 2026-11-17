import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Certificate, type LessonType } from '@lms/db';
import {
  CERTIFICATE_CODE_ALPHABET,
  CERTIFICATE_CODE_LENGTH,
  CERTIFICATE_MIN_QUIZ_AVERAGE,
  normalizeCertificateCode,
  type CertificateEligibility,
  type CertificateStatus,
  type CertificateVerification,
  type CertificateView,
} from '@lms/shared';
import { teacherRef, teacherSelect } from '../catalog/public-catalog.service';
import { ENV, type Env } from '../env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ownsFullCourse, type Db } from '../purchases/entitlements';
import { renderCertificatePdf } from './certificate-pdf';
import { CertificateErrors as E } from './errors';

/**
 * Нөхцөлд тооцогдох lesson-ы төрөл. ASSIGNMENT (ticket 13) — тооцохгүй (шийдвэр). LIVE — дуусгах механизмгүй
 * (дууссаны дараа багш бичлэг буюу VIDEO болгоход тооцогдоно), тиймээс тооцохгүй.
 */
export const CERTIFICATE_LESSON_TYPES = ['VIDEO', 'TEXT', 'PDF', 'QUIZ'] as const satisfies readonly LessonType[];

interface Evaluation {
  eligibility: CertificateEligibility;
  snapshot: { recipientName: string; courseTitle: string; teacherName: string; lessonCount: number; quizAveragePercent: number | null };
}

/**
 * Сертификат (ticket 15). Олгох нөхцөл:
 * 1. курсийг БҮТНЭЭР авсан (`CourseEntitlement`);
 * 2. курсийн архивлаагүй, шалгагдсан (APPROVED) бүх VIDEO/TEXT/PDF/QUIZ lesson дууссан (≥ 1 lesson);
 * 3. эдгээрийн доторх quiz-уудын хамгийн өндөр онооны дундаж ≥ 70% (quiz-гүй бол шаардахгүй);
 * 4. profile-д нэртэй.
 * Lesson дуусах / quiz бөглөх үед автоматаар олгоно; нөхцөл өөр замаар биелсэн (жишээ нь дараа нь курсийг
 * бүтнээр авсан, нэрээ оруулсан) үед хэрэглэгч `POST`-оор авна. Олгогдсон сертификат өөрчлөгдөхгүй
 * (DB trigger), хэрэглэгч × курс тутамд нэг.
 */
@Injectable()
export class CertificatesService {
  private readonly log = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async status(userId: string, courseId: string): Promise<CertificateStatus> {
    const [existing, ev] = await Promise.all([
      this.prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } }),
      evaluate(this.prisma, userId, courseId),
    ]);
    if (!ev && !existing) throw E.courseNotFound();
    return {
      certificate: existing ? view(existing) : null,
      eligibility: ev?.eligibility ?? emptyEligibility(),
    };
  }

  /** Хэрэглэгчийн хүсэлтээр (idempotent): олгогдсон бол түүнийг, үгүй бол нөхцөл шалгаад олгоно. */
  async issue(userId: string, courseId: string): Promise<{ certificate: CertificateView; created: boolean }> {
    const existing = await this.prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (existing) return { certificate: view(existing), created: false };
    const ev = await evaluate(this.prisma, userId, courseId);
    if (!ev) throw E.courseNotFound();
    if (!ev.eligibility.eligible) {
      const { nameMissing, ...rest } = ev.eligibility;
      const otherwiseEligible = isEligible({ ...rest, nameMissing: false });
      throw nameMissing && otherwiseEligible ? E.nameRequired() : E.notEligible();
    }
    return this.create(userId, courseId, ev);
  }

  /**
   * Lesson дуусах / quiz-ийн оноо өсөх бүрт (ticket 12-ын явц) — нөхцөл хангагдвал автоматаар олгоно.
   * Явцын хүсэлтийг хэзээ ч унагаахгүй (алдааг log-д).
   */
  async issueIfEligible(userId: string, courseId: string): Promise<void> {
    try {
      const existing = await this.prisma.certificate.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { id: true },
      });
      if (existing || !(await ownsFullCourse(this.prisma, userId, courseId))) return;
      const ev = await evaluate(this.prisma, userId, courseId);
      if (ev?.eligibility.eligible) await this.create(userId, courseId, ev);
    } catch (err) {
      this.log.error(`Сертификат автоматаар олгоход алдаа (${userId}, ${courseId}): ${(err as Error).message}`);
    }
  }

  async mine(userId: string): Promise<CertificateView[]> {
    const rows = await this.prisma.certificate.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' } });
    return rows.map(view);
  }

  /** Зөвхөн эзэмшигч өөрийн сертификатын PDF-ийг татна. */
  async pdf(userId: string, rawCode: string): Promise<{ code: string; body: Buffer }> {
    const code = normalizeCertificateCode(rawCode);
    const row = code ? await this.prisma.certificate.findUnique({ where: { code } }) : null;
    if (!row || row.userId !== userId) throw E.certificateNotFound();
    return { code: row.code, body: await renderCertificatePdf(row, this.verifyUrl(row.code)) };
  }

  /** Нийтийн шалгалт — нэвтрэлтгүй. Код буруу/байхгүй бол 404. */
  async verify(rawCode: string): Promise<CertificateVerification> {
    const code = normalizeCertificateCode(rawCode);
    const row = code ? await this.prisma.certificate.findUnique({ where: { code } }) : null;
    if (!row) throw E.certificateNotFound();
    return {
      code: row.code,
      recipientName: row.recipientName,
      courseTitle: row.courseTitle,
      teacherName: row.teacherName,
      issuedAt: row.issuedAt.toISOString(),
    };
  }

  verifyUrl(code: string): string {
    return new URL(`/verify/${code}`, this.env.PUBLIC_WEB_URL).toString();
  }

  // ---- дотоод ----------------------------------------------------------------

  /**
   * Үүсгэнэ; зэрэг хүсэлтэд (userId, courseId) unique → байгаа мөрийг буцаана (мэдэгдэл нэг л удаа).
   * Код давхцвал (магадлал ~0) шинэ кодоор дахин оролдоно.
   */
  private async create(userId: string, courseId: string, ev: Evaluation): Promise<{ certificate: CertificateView; created: boolean }> {
    for (let i = 0; ; i++) {
      try {
        const row = await this.prisma.certificate.create({ data: { userId, courseId, code: newCode(), ...ev.snapshot } });
        await this.notifications.notify({
          userId,
          type: 'CERTIFICATE_ISSUED',
          params: { course: row.courseTitle, code: row.code },
          link: `/learning/${courseId}`,
        });
        return { certificate: view(row), created: true };
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002' || i >= 3) throw err;
        const existing = await this.prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
        if (existing) return { certificate: view(existing), created: false };
      }
    }
  }
}

/** Нөхцөлийн үнэлгээ + олгох үеийн snapshot. Курс нийтлэгдээгүй/байхгүй бол null. */
async function evaluate(db: Db, userId: string, courseId: string): Promise<Evaluation | null> {
  const [course, ownsCourse, user] = await Promise.all([
    db.course.findFirst({
      where: { id: courseId, status: 'PUBLISHED' },
      select: {
        title: true,
        teacher: { select: teacherSelect },
        lessons: {
          where: { reviewStatus: 'APPROVED', archivedAt: null, type: { in: [...CERTIFICATE_LESSON_TYPES] } },
          select: { id: true, type: true },
        },
      },
    }),
    ownsFullCourse(db, userId, courseId),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  if (!course) return null;

  const ids = course.lessons.map((l) => l.id);
  const progress = ids.length
    ? await db.lessonProgress.findMany({
        where: { userId, lessonId: { in: ids } },
        select: { lessonId: true, completedAt: true, bestScorePercent: true },
      })
    : [];
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const completed = course.lessons.filter((l) => byLesson.get(l.id)?.completedAt).length;
  const quizzes = course.lessons.filter((l) => l.type === 'QUIZ');
  const quizSum = quizzes.reduce((sum, l) => sum + (byLesson.get(l.id)?.bestScorePercent ?? 0), 0);
  // floor — 69.9% нь 70%-д хүрэхгүй (ticket 12-ын оноотой ижил)
  const quizAveragePercent = quizzes.length ? Math.floor(quizSum / quizzes.length) : null;
  const recipientName = user?.name?.trim() ?? '';

  const base = {
    ownsCourse,
    lessonCount: course.lessons.length,
    completedLessonCount: completed,
    quizCount: quizzes.length,
    quizAveragePercent,
    minQuizAveragePercent: CERTIFICATE_MIN_QUIZ_AVERAGE,
    nameMissing: recipientName === '',
  };
  return {
    eligibility: { ...base, eligible: isEligible(base) },
    snapshot: {
      recipientName,
      courseTitle: course.title,
      teacherName: teacherRef(course.teacher).name,
      lessonCount: course.lessons.length,
      quizAveragePercent,
    },
  };
}

function isEligible(e: Omit<CertificateEligibility, 'eligible'>): boolean {
  return (
    e.ownsCourse &&
    e.lessonCount > 0 &&
    e.completedLessonCount === e.lessonCount &&
    (e.quizAveragePercent === null || e.quizAveragePercent >= e.minQuizAveragePercent) &&
    !e.nameMissing
  );
}

function emptyEligibility(): CertificateEligibility {
  return {
    ownsCourse: false,
    lessonCount: 0,
    completedLessonCount: 0,
    quizCount: 0,
    quizAveragePercent: null,
    minQuizAveragePercent: CERTIFICATE_MIN_QUIZ_AVERAGE,
    nameMissing: false,
    eligible: false,
  };
}

/** 16 тэмдэгт × 5 бит = 80 бит crypto random — таах боломжгүй. */
function newCode(): string {
  let code = '';
  for (let i = 0; i < CERTIFICATE_CODE_LENGTH; i++) code += CERTIFICATE_CODE_ALPHABET[randomInt(CERTIFICATE_CODE_ALPHABET.length)];
  return code;
}

function view(c: Certificate): CertificateView {
  return {
    code: c.code,
    courseId: c.courseId,
    recipientName: c.recipientName,
    courseTitle: c.courseTitle,
    teacherName: c.teacherName,
    quizAveragePercent: c.quizAveragePercent,
    issuedAt: c.issuedAt.toISOString(),
  };
}
