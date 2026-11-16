import { Injectable } from '@nestjs/common';
import { Prisma } from '@lms/db';
import type { CategoryNode } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogErrors as E } from './errors';

/** 2 түвшний ангилал. Зөвхөн админ засна; бүх өөрчлөлт audit-д. */
@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async tree(): Promise<CategoryNode[]> {
    const rows = await this.prisma.category.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
    const node = (r: (typeof rows)[number]): CategoryNode => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      position: r.position,
      children: rows.filter((c) => c.parentId === r.id).map(node),
    });
    return rows.filter((r) => !r.parentId).map(node);
  }

  async create(input: { name: string; parentId?: string | null }, actorId: string, ip?: string): Promise<CategoryNode[]> {
    if (input.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: input.parentId } });
      if (!parent) throw E.categoryNotFound();
      if (parent.parentId) throw E.categoryDepth();
    }
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.category.aggregate({
        where: { parentId: input.parentId ?? null },
        _max: { position: true },
      });
      const category = await tx.category.create({
        data: {
          name: input.name,
          parentId: input.parentId ?? null,
          slug: await uniqueSlug(tx, slugify(input.name)),
          position: (last._max.position ?? -1) + 1,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'category.create',
        targetType: 'category',
        targetId: category.id,
        after: { name: category.name, parentId: category.parentId },
        ip,
      });
    });
    return this.tree();
  }

  async update(id: string, input: { name?: string; position?: number }, actorId: string, ip?: string) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw E.categoryNotFound();
      const after = await tx.category.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        actorId,
        action: 'category.update',
        targetType: 'category',
        targetId: id,
        before: { name: before.name, position: before.position },
        after: { name: after.name, position: after.position },
        ip,
      });
    });
    return this.tree();
  }

  async remove(id: string, actorId: string, ip?: string): Promise<CategoryNode[]> {
    await this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id },
        include: { _count: { select: { children: true, courses: true } } },
      });
      if (!category) throw E.categoryNotFound();
      if (category._count.children > 0 || category._count.courses > 0) throw E.categoryInUse();
      await tx.category.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'category.delete',
        targetType: 'category',
        targetId: id,
        before: { name: category.name, parentId: category.parentId },
        ip,
      });
    });
    return this.tree();
  }
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Кирилл нэрийг URL-д тохирох латин slug болгоно: "Програмчлал" → "programchlal". */
export function slugify(name: string): string {
  const latin = [...name.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('');
  return (
    latin
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'category'
  );
}

async function uniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await tx.category.findUnique({ where: { slug } }))) return slug;
  }
}
