import { Injectable } from '@nestjs/common';
import type { CreditPackage } from '@lms/db';
import type { CreditPackageView } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditErrors as E } from './errors';

export interface PackageInput {
  name: string;
  credits: number;
  priceMnt: number;
  active: boolean;
  isTest: boolean;
  position: number;
}

/** Кредит багц. Зөвхөн админ засна; өөрчлөлт бүр audit-д (нэг transaction-д). */
@Injectable()
export class CreditPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Хэрэглэгчид: идэвхтэй багцууд. Тест багц зөвхөн админд. */
  async listForUser(isAdmin: boolean): Promise<CreditPackageView[]> {
    const rows = await this.prisma.creditPackage.findMany({
      where: { active: true, ...(isAdmin ? {} : { isTest: false }) },
      orderBy: [{ position: 'asc' }, { priceMnt: 'asc' }],
    });
    return rows.map(toView);
  }

  /** Худалдан авах боломжтой багц, эсвэл 404 (тест багцыг админ бус хүнд байхгүй мэт). */
  async purchasable(id: string, isAdmin: boolean): Promise<CreditPackage> {
    const pkg = await this.prisma.creditPackage.findUnique({ where: { id } });
    if (!pkg || !pkg.active || (pkg.isTest && !isAdmin)) throw E.packageNotFound();
    return pkg;
  }

  async listAll(): Promise<CreditPackageView[]> {
    const rows = await this.prisma.creditPackage.findMany({ orderBy: [{ position: 'asc' }, { priceMnt: 'asc' }] });
    return rows.map(toView);
  }

  async create(input: PackageInput, actorId: string, ip?: string): Promise<CreditPackageView> {
    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.creditPackage.create({ data: input });
      await this.audit.record(tx, {
        actorId,
        action: 'credit_package.create',
        targetType: 'credit_package',
        targetId: pkg.id,
        after: snapshot(pkg),
        ip,
      });
      return toView(pkg);
    });
  }

  async update(id: string, input: Partial<PackageInput>, actorId: string, ip?: string): Promise<CreditPackageView> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.creditPackage.findUnique({ where: { id } });
      if (!before) throw E.packageNotFound();
      const after = await tx.creditPackage.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        actorId,
        action: 'credit_package.update',
        targetType: 'credit_package',
        targetId: id,
        before: snapshot(before),
        after: snapshot(after),
        ip,
      });
      return toView(after);
    });
  }

  /** Төлбөр холбогдоогүй багцыг л устгана (түүх алдагдахгүй); бусад үед идэвхгүй болгоно. */
  async remove(id: string, actorId: string, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pkg = await tx.creditPackage.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
      if (!pkg) throw E.packageNotFound();
      if (pkg._count.payments > 0) throw E.packageInUse();
      await tx.creditPackage.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'credit_package.delete',
        targetType: 'credit_package',
        targetId: id,
        before: snapshot(pkg),
        ip,
      });
    });
  }
}

function snapshot(p: CreditPackage) {
  return { name: p.name, credits: p.credits, priceMnt: p.priceMnt, active: p.active, isTest: p.isTest, position: p.position };
}

function toView(p: CreditPackage): CreditPackageView {
  return { id: p.id, ...snapshot(p) };
}
