import { Injectable } from '@nestjs/common';
import type { AdminOverview } from '@lms/shared';
import { REVIEW_QUEUE_WHERE } from '../catalog/course-review.service';
import { PrismaService } from '../prisma/prisma.service';
import { issueWhere } from './payment-reconciliation.service';

/** Админы тойм: хүлээгдэж буй ажлын тоо. Нөхцөл бүр тухайн жагсаалтын хуудастай ижил. */
@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(now = new Date()): Promise<AdminOverview> {
    const [teacherApplications, courseReviews, payouts, paymentIssues] = await Promise.all([
      this.prisma.teacherApplication.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.course.count({ where: REVIEW_QUEUE_WHERE }),
      this.prisma.payout.count({ where: { status: 'REQUESTED' } }),
      this.prisma.payment.count({ where: { OR: Object.values(issueWhere(now)) } }),
    ]);
    return { pending: { teacherApplications, courseReviews, payouts, paymentIssues } };
  }
}
