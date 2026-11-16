import { Injectable } from '@nestjs/common';
import { Prisma } from '@lms/db';
import type { AuditPage } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';

export type Db = PrismaService | Prisma.TransactionClient;

export interface AuditInput {
  /** null = систем (CLI, cron) */
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/**
 * Audit log. Өөрчлөлттэй **нэг transaction-д** бичихийн тулд `db`-д transaction client дамжуулна —
 * өөрчлөлт амжилттай боловч audit алга болох (эсвэл эсрэгээрээ) нөхцөл үүсэхгүй.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(db: Db, input: AuditInput): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: toJson(input.before),
        after: toJson(input.after),
        ip: input.ip ?? null,
      },
    });
  }

  async list(opts: { limit: number; before?: string; action?: string; actorId?: string }): Promise<AuditPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: { action: opts.action, actorId: opts.actorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      include: { actor: { select: { id: true, name: true } } },
    });
    const page = rows.slice(0, opts.limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        actor: r.actor,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
