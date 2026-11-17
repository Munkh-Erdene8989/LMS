import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Payment } from '@lms/db';
import type {
  AdminPaymentRow,
  PaymentIssueKind,
  PaymentIssueView,
  PaymentIssuesView,
  PaymentResolveAction,
  ReconcileCanceledResult,
} from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { QPAY, type QPayAdapter } from '../adapters/qpay';
import { CREDIT_TX_OPTIONS, CreditsService } from '../credits/credits.service';
import { CreditErrors } from '../credits/errors';
import { PaymentsService } from '../credits/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { contactSelect, toContact, toPaymentRow } from './contact';
import { AdminOpsErrors as E } from './errors';

/** PENDING нэхэмжлэхийг хэдэн минутын дараа "хуучирсан" гэж үзэх (QPay QR ~ хэдэн минутад төлөгддөг). */
export const STALE_PENDING_MINUTES = 60;
/** Картаар татагдсан ч олголтгүй PENDING — ердийн урсгал секундэд дуусна; энэ хугацааны дараа асуудал. */
const CARD_UNSETTLED_MINUTES = 10;
/** Цуцалсан нэхэмжлэхийг дахин шалгах хугацаа (QPay нэхэмжлэх үүнээс хойш төлөгдөх магадлал бага). */
const RECONCILE_CANCELED_DAYS = 30;
const RECONCILE_BATCH = 100;
const LIST_LIMIT = 200;

const MIN = 60_000;

/**
 * Асуудалтай төлбөрийн тохирол (ticket 08/17-ийн үлдэгдэл, 22).
 *
 * - Жагсаалт: хуучирсан PENDING, картаас татагдсан ч олгоогүй, `AMOUNT_MISMATCH`, цуцалсан ч дараа нь
 *   төлөгдсөн (`CANCELED` + `paidAmountMnt`). Шийдсэн (`resolvedAt`) нь жагсаалтаас гарна.
 * - "Дахин шалгах": PENDING → эзэмшигч service-ийн ердийн verify (олголт exactly-once хэвээр);
 *   CANCELED/FAILED → QPay-ээс шалгаж, төлөгдсөн бол `paidAmountMnt`-ийг тэмдэглэнэ (кредит олгохгүй).
 * - "Олгох": кредит зөвхөн `CreditsService.grant`-аар; lot-ын `payment_id` unique тул нэг төлбөрт нэг л
 *   олголт. Subscription-ийн PENDING төлбөр → `SubscriptionsService.settleByAdmin` (үе + ACTIVE).
 * - "Хаах": олголтгүй; PENDING бол QPay дээр цуцлаад дахин шалгана (төлөгдсөн байвал ердийнхөөр олгоно).
 * - Үйлдэл бүр audit-тай; шийдвэрийн тэмдэглэл заавал.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly log = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly payments: PaymentsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
    @Inject(QPAY) private readonly qpay: QPayAdapter,
  ) {}

  async issues(now = new Date()): Promise<PaymentIssuesView> {
    const where = issueWhere(now);
    const kinds = Object.keys(where) as PaymentIssueKind[];
    const [rows, counts] = await Promise.all([
      Promise.all(
        kinds.map((kind) =>
          this.prisma.payment
            .findMany({
              where: where[kind],
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: LIST_LIMIT,
              include: { user: { select: contactSelect } },
            })
            .then((list) => list.map((p) => ({ kind, p }))),
        ),
      ),
      Promise.all(kinds.map((kind) => this.prisma.payment.count({ where: where[kind] }))),
    ]);
    return {
      items: rows.flat().map(({ kind, p }): PaymentIssueView => ({ ...toPaymentRow(p), kind, user: toContact(p.user) })),
      counts: Object.fromEntries(kinds.map((k, i) => [k, counts[i]!])) as Record<PaymentIssueKind, number>,
      staleMinutes: STALE_PENDING_MINUTES,
    };
  }

  /** QPay-ээс дахин шалгах. Audit-д өмнөх/дараах төлөв. */
  async recheck(id: string, adminId: string, ip?: string): Promise<AdminPaymentRow> {
    const before = await this.get(id);
    let after: Payment;
    if (before.status === 'PENDING' && before.providerInvoiceId) {
      after =
        before.purpose === 'SUBSCRIPTION'
          ? await this.subscriptions.recheckForAdmin(id)
          : await this.payments.recheckForAdmin(id);
    } else if ((before.status === 'CANCELED' || before.status === 'FAILED') && before.providerInvoiceId) {
      after = await this.checkClosed(before);
    } else {
      after = before;
    }
    await this.audit.record(this.prisma, {
      actorId: adminId,
      action: 'payment.recheck',
      targetType: 'payment',
      targetId: id,
      before: { status: before.status, paidAmountMnt: before.paidAmountMnt },
      after: { status: after.status, paidAmountMnt: after.paidAmountMnt },
      ip,
    });
    return toPaymentRow(after);
  }

  /** Сүүлийн 30 хоногийн цуцалсан нэхэмжлэхүүдийг QPay-ээс шалгаж, дараа нь төлөгдсөнийг илрүүлнэ. */
  async reconcileCanceled(adminId: string, ip?: string, now = new Date()): Promise<ReconcileCanceledResult> {
    const list = await this.prisma.payment.findMany({
      where: {
        status: 'CANCELED',
        providerInvoiceId: { not: null },
        paidAmountMnt: null,
        createdAt: { gte: new Date(now.getTime() - RECONCILE_CANCELED_DAYS * 24 * 60 * MIN) },
      },
      orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      take: RECONCILE_BATCH,
    });
    const result: ReconcileCanceledResult = { checked: 0, found: 0, failed: 0 };
    for (const p of list) {
      try {
        const after = await this.checkClosed(p);
        result.checked++;
        if (after.paidAmountMnt) result.found++;
      } catch (err) {
        result.failed++;
        this.log.warn(`Цуцалсан нэхэмжлэх шалгаж чадсангүй (${p.id}): ${(err as Error).message}`);
      }
    }
    await this.audit.record(this.prisma, {
      actorId: adminId,
      action: 'payment.reconcile_canceled',
      targetType: 'payment',
      targetId: 'CANCELED',
      after: { ...result },
      ip,
    });
    return result;
  }

  async resolve(
    id: string,
    input: { action: PaymentResolveAction; note: string },
    adminId: string,
    ip?: string,
  ): Promise<AdminPaymentRow> {
    const p = await this.get(id);
    if (p.resolution) {
      // Давтан дарах: ижил шийдвэр бол idempotent, эсрэг бол 409.
      if (p.resolution === (input.action === 'GRANT' ? 'GRANTED' : 'CLOSED')) return toPaymentRow(p);
      throw E.notResolvable('Энэ төлбөрийг өөр шийдвэрээр аль хэдийн шийдсэн байна.');
    }
    if (p.status === 'PAID') throw E.notResolvable('Төлбөр аль хэдийн олгогдсон (PAID) байна.');
    return input.action === 'GRANT' ? this.grant(p, input.note, adminId, ip) : this.close(p, input.note, adminId, ip);
  }

  // ---- дотоод ---------------------------------------------------------------

  /**
   * Олгох: мөнгө орсон нь батлагдсан төлбөр л — картаар татагдсан PENDING (`providerPaymentId`),
   * `AMOUNT_MISMATCH`, эсвэл цуцалсан ч төлөгдсөн нь илэрсэн. Хуучирсан нэхэмжлэхийг эхлээд дахин шална.
   */
  private async grant(p: Payment, note: string, adminId: string, ip?: string): Promise<AdminPaymentRow> {
    const paidProof =
      (p.status === 'PENDING' && p.providerPaymentId !== null) ||
      p.status === 'AMOUNT_MISMATCH' ||
      (p.status === 'CANCELED' && (p.paidAmountMnt ?? 0) > 0);
    if (!paidProof) {
      throw E.notResolvable('Төлөгдсөн нь батлагдаагүй төлбөр. Эхлээд "Дахин шалгах"-аар QPay-ээс шалгана уу.');
    }
    const auditFor = (tx: Prisma.TransactionClient, extra: Record<string, unknown> = {}) =>
      this.audit.record(tx, {
        actorId: adminId,
        action: 'payment.resolve',
        targetType: 'payment',
        targetId: p.id,
        before: { status: p.status, paidAmountMnt: p.paidAmountMnt },
        after: { status: 'PAID', resolution: 'GRANTED', credits: p.credits, note, ...extra },
        ip,
      });

    if (p.purpose === 'SUBSCRIPTION' && p.status === 'PENDING') {
      const done = await this.subscriptions.settleByAdmin(p, {
        actorId: adminId,
        note,
        audit: (tx) => auditFor(tx, { via: 'subscription.settle' }),
      });
      if (!done) throw E.stateChanged();
      return toPaymentRow(await this.get(p.id));
    }

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.payment.updateMany({
          where: { id: p.id, status: p.status, resolvedAt: null },
          data: {
            status: 'PAID',
            paidAt: p.paidAt ?? now,
            resolvedAt: now,
            resolvedById: adminId,
            resolution: 'GRANTED',
            resolutionNote: note,
          },
        });
        if (count !== 1) throw E.stateChanged();
        const grant = await this.credits.grant(tx, {
          userId: p.userId,
          credits: p.credits,
          source: p.purpose === 'SUBSCRIPTION' ? 'SUBSCRIPTION_GRANT' : 'TOPUP',
          paymentId: p.id,
          isTest: p.isTest,
          reason: note,
          actorId: adminId,
          refType: 'payment_resolution',
          refId: p.id,
          now,
        });
        await auditFor(tx, { lotId: grant.lotId, entryId: grant.entryId });
      }, CREDIT_TX_OPTIONS);
    } catch (err) {
      // Lot-ын payment_id unique: өөр замаар аль хэдийн олгогдсон.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw E.stateChanged();
      throw err;
    }
    return toPaymentRow(await this.get(p.id));
  }

  /** Хаах (олголтгүй). PENDING нэхэмжлэхийг QPay дээр цуцалж, дахин шалгана — төлөгдсөн байвал хаахгүй. */
  private async close(p: Payment, note: string, adminId: string, ip?: string): Promise<AdminPaymentRow> {
    if (p.status === 'PENDING' && p.providerInvoiceId && p.method === 'INVOICE') {
      await this.qpay.cancelInvoice(p.providerInvoiceId).catch((err: Error) => {
        this.log.warn(`QPay нэхэмжлэх цуцалж чадсангүй (${p.id}): ${err.message}`);
      });
      const verified =
        p.purpose === 'SUBSCRIPTION'
          ? await this.subscriptions.recheckForAdmin(p.id)
          : await this.payments.recheckForAdmin(p.id);
      if (verified.status !== 'PENDING') throw E.stateChanged();
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: p.id, status: p.status, resolvedAt: null },
        data: {
          ...(p.status === 'PENDING' ? { status: 'CANCELED' as const, failureReason: 'admin_closed' } : {}),
          resolvedAt: now,
          resolvedById: adminId,
          resolution: 'CLOSED',
          resolutionNote: note,
        },
      });
      if (count !== 1) throw E.stateChanged();
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'payment.resolve',
        targetType: 'payment',
        targetId: p.id,
        before: { status: p.status, paidAmountMnt: p.paidAmountMnt },
        after: { status: p.status === 'PENDING' ? 'CANCELED' : p.status, resolution: 'CLOSED', note },
        ip,
      });
    });
    return toPaymentRow(await this.get(p.id));
  }

  /**
   * Цуцалсан/амжилтгүй нэхэмжлэх QPay дээр төлөгдсөн эсэх. Шинээр төлөгдсөн нь илэрвэл `paidAmountMnt`-ийг
   * тэмдэглэж (олгохгүй), өмнө нь админ "хаасан" байсан ч шийдвэрийг цэвэрлэнэ — мөнгө орсон тул дахин
   * жагсаалтад гарч, админ шийднэ (хуучин шийдвэр audit-д).
   */
  private async checkClosed(p: Payment): Promise<Payment> {
    let check;
    try {
      check = await this.qpay.checkInvoice(p.providerInvoiceId!);
    } catch {
      throw CreditErrors.providerUnavailable();
    }
    const paid = check.rows.filter((r) => r.status === 'PAID');
    const now = new Date();
    if (paid.length === 0 || p.paidAmountMnt !== null) {
      return this.prisma.payment.update({ where: { id: p.id }, data: { lastCheckedAt: now } });
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: p.id, status: p.status, paidAmountMnt: null },
        data: {
          paidAmountMnt: check.paidAmountMnt,
          providerPaymentId: paid[0]!.paymentId,
          lastCheckedAt: now,
          resolvedAt: null,
          resolvedById: null,
          resolution: null,
          resolutionNote: null,
        },
      });
      if (count !== 1) return;
      await this.audit.record(tx, {
        actorId: null,
        action: 'payment.canceled_paid',
        targetType: 'payment',
        targetId: p.id,
        before: { status: p.status, resolution: p.resolution, resolutionNote: p.resolutionNote },
        after: { paidAmountMnt: check.paidAmountMnt, providerPaymentIds: paid.map((r) => r.paymentId) },
      });
      this.log.error(`Цуцалсан нэхэмжлэх төлөгдсөн (${p.id}): ${check.paidAmountMnt}₮ — админ шийднэ`);
    });
    return this.get(p.id);
  }

  private async get(id: string): Promise<Payment> {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw E.paymentNotFound();
    return p;
  }
}

function issueWhere(now: Date): Record<PaymentIssueKind, Prisma.PaymentWhereInput> {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN);
  return {
    CARD_UNSETTLED: {
      status: 'PENDING',
      providerPaymentId: { not: null },
      resolvedAt: null,
      createdAt: { lte: ago(CARD_UNSETTLED_MINUTES) },
    },
    AMOUNT_MISMATCH: { status: 'AMOUNT_MISMATCH', resolvedAt: null },
    CANCELED_PAID: { status: 'CANCELED', paidAmountMnt: { gt: 0 }, resolvedAt: null },
    STALE_PENDING: {
      status: 'PENDING',
      providerPaymentId: null,
      resolvedAt: null,
      createdAt: { lte: ago(STALE_PENDING_MINUTES) },
    },
  };
}
