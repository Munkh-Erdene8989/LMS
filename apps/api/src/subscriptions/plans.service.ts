import { Injectable } from '@nestjs/common';
import type { SubscriptionPlan } from '@lms/db';
import type { SubscriptionPlanView } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionErrors as E } from './errors';

export interface PlanInput {
  name: string;
  priceMnt: number;
  credits: number;
  active: boolean;
  position: number;
}

/**
 * Сарын багц. Зөвхөн админ засна; өөрчлөлт бүр audit-тай нэг transaction-д.
 * Идэвхгүй болгох нь зөвхөн шинэ бүртгэлийг хаана — одоо байгаа бүртгэлүүд тухайн багцын
 * одоогийн үнэ, кредитээр сунгагдсаар байна.
 */
@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listActive(): Promise<SubscriptionPlanView[]> {
    const rows = await this.prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: [{ position: 'asc' }, { priceMnt: 'asc' }],
    });
    return rows.map(toPlanView);
  }

  async listAll(): Promise<SubscriptionPlanView[]> {
    const rows = await this.prisma.subscriptionPlan.findMany({ orderBy: [{ position: 'asc' }, { priceMnt: 'asc' }] });
    return rows.map(toPlanView);
  }

  /** Шинээр бүртгүүлэх боломжтой (идэвхтэй) багц, эсвэл 404. */
  async purchasable(id: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan || !plan.active) throw E.planNotFound();
    return plan;
  }

  async create(input: PlanInput, actorId: string, ip?: string): Promise<SubscriptionPlanView> {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.create({ data: input });
      await this.audit.record(tx, {
        actorId,
        action: 'subscription_plan.create',
        targetType: 'subscription_plan',
        targetId: plan.id,
        after: snapshot(plan),
        ip,
      });
      return toPlanView(plan);
    });
  }

  async update(id: string, input: Partial<PlanInput>, actorId: string, ip?: string): Promise<SubscriptionPlanView> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.subscriptionPlan.findUnique({ where: { id } });
      if (!before) throw E.planNotFound();
      const after = await tx.subscriptionPlan.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        actorId,
        action: 'subscription_plan.update',
        targetType: 'subscription_plan',
        targetId: id,
        before: snapshot(before),
        after: snapshot(after),
        ip,
      });
      return toPlanView(after);
    });
  }

  /** Бүртгэл/төлбөр холбогдоогүй багцыг л устгана; бусад үед идэвхгүй болгоно. */
  async remove(id: string, actorId: string, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({
        where: { id },
        include: { _count: { select: { subscriptions: true, payments: true } } },
      });
      if (!plan) throw E.planNotFound();
      if (plan._count.subscriptions > 0 || plan._count.payments > 0) throw E.planInUse();
      await tx.subscriptionPlan.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'subscription_plan.delete',
        targetType: 'subscription_plan',
        targetId: id,
        before: snapshot(plan),
        ip,
      });
    });
  }
}

function snapshot(p: SubscriptionPlan) {
  return { name: p.name, priceMnt: p.priceMnt, credits: p.credits, active: p.active, position: p.position };
}

export function toPlanView(p: SubscriptionPlan): SubscriptionPlanView {
  return { id: p.id, ...snapshot(p) };
}
