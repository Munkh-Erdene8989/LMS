import { Injectable } from '@nestjs/common';
import type { OrgReport, OrgReportRow } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { t } from '../i18n';
import { toCsv } from '../payouts/csv';
import { PrismaService } from '../prisma/prisma.service';
import { OrgErrors } from './organizations.errors';

export interface OrgReportFilter {
  courseId?: string;
  includeRemoved: boolean;
}

type Actor = { id: string; ip?: string };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/**
 * Байгууллагын явцын тайлан (ticket 48, story 90): мөр = гишүүн × олгосон курс.
 * Дүрмүүд "Миний сургалт"-тай ижил: lesson = шалгагдсан (APPROVED) ба архивлаагүй; явц = floor(дууссан × 100 / нийт);
 * quiz-ийн дундаж = quiz бүрийн хамгийн өндөр оноо, floor (сертификатын дүрэм). Хэдэн ч гишүүн/курс байсан
 * 5 бүлэглэсэн query (member, grant, lesson, progress, certificate) — N+1 үгүй.
 */
@Injectable()
export class OrgReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async report(organizationId: string, filter: OrgReportFilter): Promise<OrgReport> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw OrgErrors.notFound();

    const [members, grants] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { organizationId, ...(filter.includeRemoved ? {} : { removedAt: null }) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { user: { select: { name: true, identifiers: { select: { type: true, value: true } } } } },
      }),
      this.prisma.organizationCourseGrant.findMany({
        where: { organizationId, ...(filter.courseId ? { courseId: filter.courseId } : {}) },
        orderBy: [{ createdAt: 'asc' }, { courseId: 'asc' }],
        select: { courseId: true, course: { select: { title: true } } },
      }),
    ]);
    if (members.length === 0 || grants.length === 0) return { rows: [] };

    // Хасагдаад дахин нэгдсэн хүн хоёр мөртэй байж болно — идэвхтэйг нь авна.
    const byUser = new Map<string, (typeof members)[number]>();
    for (const m of members) {
      const prev = byUser.get(m.userId);
      if (!prev || (prev.removedAt !== null && m.removedAt === null)) byUser.set(m.userId, m);
    }
    const people = [...byUser.values()];
    const userIds = people.map((m) => m.userId);
    const courseIds = grants.map((g) => g.courseId);

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId: { in: courseIds }, reviewStatus: 'APPROVED', archivedAt: null },
      select: { id: true, courseId: true, type: true },
    });
    const lessonIds = lessons.map((l) => l.id);
    const [progress, certificates] = await Promise.all([
      lessonIds.length
        ? this.prisma.lessonProgress.findMany({
            where: { userId: { in: userIds }, lessonId: { in: lessonIds } },
            select: { userId: true, lessonId: true, completedAt: true, bestScorePercent: true, lastViewedAt: true },
          })
        : [],
      this.prisma.certificate.findMany({
        where: { userId: { in: userIds }, courseId: { in: courseIds } },
        select: { userId: true, courseId: true, code: true, issuedAt: true },
      }),
    ]);

    const lessonsByCourse = new Map<string, typeof lessons>();
    for (const l of lessons) lessonsByCourse.set(l.courseId, [...(lessonsByCourse.get(l.courseId) ?? []), l]);
    const progressByUser = new Map<string, Map<string, (typeof progress)[number]>>();
    for (const p of progress) {
      const m = progressByUser.get(p.userId) ?? new Map();
      m.set(p.lessonId, p);
      progressByUser.set(p.userId, m);
    }
    const certByKey = new Map(certificates.map((c) => [`${c.userId}:${c.courseId}`, c]));

    const rows: OrgReportRow[] = [];
    for (const m of people) {
      const mine = progressByUser.get(m.userId);
      for (const g of grants) {
        const cl = lessonsByCourse.get(g.courseId) ?? [];
        const done = cl.filter((l) => mine?.get(l.id)?.completedAt).length;
        const quizzes = cl.filter((l) => l.type === 'QUIZ');
        const quizSum = quizzes.reduce((s, l) => s + (mine?.get(l.id)?.bestScorePercent ?? 0), 0);
        let last: Date | null = null;
        for (const l of cl) {
          const at = mine?.get(l.id)?.lastViewedAt;
          if (at && (!last || at > last)) last = at;
        }
        const cert = certByKey.get(`${m.userId}:${g.courseId}`);
        rows.push({
          memberId: m.id,
          userId: m.userId,
          name: m.user.name,
          phone: m.user.identifiers.find((i) => i.type === 'PHONE')?.value ?? null,
          email: m.user.identifiers.find((i) => i.type === 'EMAIL')?.value ?? null,
          removed: m.removedAt !== null,
          courseId: g.courseId,
          courseTitle: g.course.title,
          progressPercent: cl.length === 0 ? 0 : Math.floor((done * 100) / cl.length),
          completedLessonCount: done,
          lessonCount: cl.length,
          quizAveragePercent: quizzes.length ? Math.floor(quizSum / quizzes.length) : null,
          certificateCode: cert?.code ?? null,
          certificateIssuedAt: cert?.issuedAt.toISOString() ?? null,
          lastActivityAt: last?.toISOString() ?? null,
        });
      }
    }
    return { rows };
  }

  /** CSV (UTF-8 BOM, Mongolian толгой, formula injection-оос хамгаалсан). Export бүр audit log-д. */
  async exportCsv(organizationId: string, filter: OrgReportFilter, actor: Actor): Promise<{ csv: string; orgName: string }> {
    const { rows } = await this.report(organizationId, filter);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    await this.audit.record(this.prisma, {
      actorId: actor.id,
      action: 'organization.report.export',
      targetType: 'organization',
      targetId: organizationId,
      after: { rows: rows.length, courseId: filter.courseId ?? null, includeRemoved: filter.includeRemoved },
      ip: actor.ip,
    });
    const header = [
      t('orgReport.colName'),
      t('orgReport.colContact'),
      t('orgReport.colCourse'),
      t('orgReport.colProgress'),
      t('orgReport.colQuiz'),
      t('orgReport.colCertCode'),
      t('orgReport.colCertDate'),
      t('orgReport.colLastActive'),
      t('orgReport.colStatus'),
    ];
    const csv = toCsv(
      header,
      rows.map((r) => [
        r.name ?? '',
        [r.phone, r.email].filter(Boolean).join(' / '),
        r.courseTitle,
        r.progressPercent,
        r.quizAveragePercent ?? '',
        r.certificateCode ?? '',
        ymd(r.certificateIssuedAt ? new Date(r.certificateIssuedAt) : null),
        ymd(r.lastActivityAt ? new Date(r.lastActivityAt) : null),
        t(r.removed ? 'orgReport.statusRemoved' : 'orgReport.statusActive'),
      ]),
    );
    return { csv, orgName: org.name };
  }
}
