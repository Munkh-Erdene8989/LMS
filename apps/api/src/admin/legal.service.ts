import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type LegalDocType, type LegalDocument } from '@lms/db';
import { LEGAL_DOC_TYPES, type LegalDocView, type LegalStatus } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Баримт олдсонгүй.' });

/**
 * Хууль эрх зүйн баримт (нөхцөл, нууцлал, багшийн гэрээ). Ноорог засаж болно, нийтэлсэн
 * хувилбар өөрчлөгдөхгүй. Одоогийн хувилбар = хамгийн сүүлд нийтэлсэн.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async current(type: LegalDocType): Promise<LegalDocument | null> {
    return this.prisma.legalDocument.findFirst({
      where: { type, publishedAt: { not: null } },
      orderBy: { version: 'desc' },
    });
  }

  async publicCurrent(type: LegalDocType): Promise<LegalDocView> {
    const doc = await this.current(type);
    if (!doc) throw notFound();
    return toView(doc);
  }

  async publicVersion(type: LegalDocType, version: number): Promise<LegalDocView> {
    const doc = await this.prisma.legalDocument.findUnique({ where: { type_version: { type, version } } });
    if (!doc?.publishedAt) throw notFound();
    return toView(doc);
  }

  async listVersions(type: LegalDocType): Promise<LegalDocView[]> {
    const docs = await this.prisma.legalDocument.findMany({ where: { type }, orderBy: { version: 'desc' } });
    return docs.map(toView);
  }

  /** Шинэ ноорог. Нэг төрөлд нэг л ноорог байна — байвал түүнийг засна. */
  async createDraft(type: LegalDocType, input: { title: string; body: string }, actorId: string, ip?: string) {
    const existingDraft = await this.prisma.legalDocument.findFirst({ where: { type, publishedAt: null } });
    if (existingDraft) {
      throw new ConflictException({ code: 'DRAFT_EXISTS', message: 'Нийтлээгүй ноорог байна. Түүнийг засна уу.' });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const last = await tx.legalDocument.findFirst({ where: { type }, orderBy: { version: 'desc' } });
        const doc = await tx.legalDocument.create({
          data: { type, version: (last?.version ?? 0) + 1, ...input, createdById: actorId },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'legal.draft.create',
          targetType: 'legal_document',
          targetId: doc.id,
          after: { type, version: doc.version, title: doc.title },
          ip,
        });
        return toView(doc);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'DRAFT_EXISTS', message: 'Зэрэг үүсгэсэн ноорог байна.' });
      }
      throw err;
    }
  }

  async updateDraft(id: string, input: { title?: string; body?: string }, actorId: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.draftOrThrow(tx, id);
      const updated = await tx.legalDocument.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        actorId,
        action: 'legal.draft.update',
        targetType: 'legal_document',
        targetId: id,
        before: { title: doc.title, bodyLength: doc.body.length },
        after: { title: updated.title, bodyLength: updated.body.length },
        ip,
      });
      return toView(updated);
    });
  }

  async publish(id: string, actorId: string, ip?: string): Promise<LegalDocView> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.draftOrThrow(tx, id);
      const published = await tx.legalDocument.update({ where: { id }, data: { publishedAt: new Date() } });
      await this.audit.record(tx, {
        actorId,
        action: 'legal.publish',
        targetType: 'legal_document',
        targetId: id,
        after: { type: doc.type, version: doc.version },
        ip,
      });
      return toView(published);
    });
  }

  /** Хэрэглэгч одоогийн хувилбарыг зөвшөөрнө. Хуучин хувилбарын дугаар ирвэл татгалзана. */
  async accept(userId: string, type: LegalDocType, version: number, ip?: string): Promise<LegalStatus> {
    const doc = await this.current(type);
    if (!doc) throw notFound();
    if (doc.version !== version) {
      throw new ConflictException({
        code: 'VERSION_OUTDATED',
        message: 'Баримтын шинэ хувилбар гарсан байна. Дахин уншаад зөвшөөрнө үү.',
      });
    }
    await this.prisma.legalAcceptance.upsert({
      where: { userId_documentId: { userId, documentId: doc.id } },
      create: { userId, documentId: doc.id, ip: ip ?? null },
      update: {},
    });
    return (await this.status(userId)).find((s) => s.type === type)!;
  }

  /** Бусад модульд (жишээ нь багшийн өргөдөл): одоогийн хувилбарыг зөвшөөрсөн эсэх. */
  async hasAcceptedCurrent(userId: string, type: LegalDocType): Promise<boolean> {
    return (await this.status(userId)).find((s) => s.type === type)!.upToDate;
  }

  async status(userId: string): Promise<LegalStatus[]> {
    const [published, acceptances] = await Promise.all([
      this.prisma.legalDocument.findMany({
        where: { publishedAt: { not: null } },
        orderBy: { version: 'desc' },
        select: { type: true, version: true },
      }),
      this.prisma.legalAcceptance.findMany({
        where: { userId },
        include: { document: { select: { type: true, version: true } } },
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);
    return LEGAL_DOC_TYPES.map((type) => {
      const currentVersion = published.find((d) => d.type === type)?.version ?? null;
      const latest = acceptances
        .filter((a) => a.document.type === type)
        .sort((a, b) => b.document.version - a.document.version)[0];
      return {
        type,
        currentVersion,
        acceptedVersion: latest?.document.version ?? null,
        acceptedAt: latest?.acceptedAt.toISOString() ?? null,
        upToDate: currentVersion !== null && latest?.document.version === currentVersion,
      };
    });
  }

  private async draftOrThrow(tx: Prisma.TransactionClient, id: string): Promise<LegalDocument> {
    const doc = await tx.legalDocument.findUnique({ where: { id } });
    if (!doc) throw notFound();
    if (doc.publishedAt) {
      throw new ConflictException({ code: 'ALREADY_PUBLISHED', message: 'Нийтэлсэн хувилбарыг засах боломжгүй.' });
    }
    return doc;
  }
}

function toView(doc: LegalDocument): LegalDocView {
  return {
    id: doc.id,
    type: doc.type,
    version: doc.version,
    title: doc.title,
    body: doc.body,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
