import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma, type Payment, type Subscription, type SubscriptionPlan } from '@lms/db';
import {
  BRAND,
  type QPayDeeplinkView,
  type SubscriptionActionResult,
  type SubscriptionOverview,
  type SubscriptionPaymentView,
  type SubscriptionView,
} from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { SettingsService } from '../admin/settings.service';
import { QPAY, type QPayAdapter } from '../adapters/qpay';
import { CREDIT_TX_OPTIONS, CreditsService, addMonths, type Tx } from '../credits/credits.service';
import { CreditErrors } from '../credits/errors';
import { ENV, type Env } from '../env';
import { t } from '../i18n';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationType } from '../notifications/render';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { SubscriptionErrors as E } from './errors';
import { SubscriptionPlansService, toPlanView } from './plans.service';
import { GRACE_DAYS, assertAction, assertTransition, canTransition } from './state';

export const SUBSCRIPTION_RENEW_JOB = 'subscriptions.renew';
/** Өдөр бүр 09:00 (Улаанбаатар) — мэдэгдэл өдрийн цагаар очно. */
export const SUBSCRIPTION_RENEW_CRON = '0 9 * * *';

const DAY = 24 * 60 * 60_000;
const BATCH = 200;
/** PAST_DUE болсноос хойш нэхэмжлэх алга бол дахин үүсгэхийн өмнө хүлээх (өөр ажил картаар татаж байж магадгүй). */
const REISSUE_AFTER_MS = 10 * 60_000;

type SubWithPlan = Subscription & { plan: SubscriptionPlan };

/** Админы гар олголт (ticket 22): шийдвэрийн тэмдэглэл + олголттой нэг transaction-д audit. */
export interface AdminSettle {
  actorId: string;
  note: string;
  audit: (tx: Tx) => Promise<void>;
}

export interface RenewalReport {
  renewed: number;
  pastDue: number;
  paused: number;
  invoiced: number;
}

/**
 * Сарын багц: эхлэх, сунгах, цуцлах, дахин идэвхжүүлэх. Төлөвийн шилжилт `state.ts`.
 *
 * Exactly-once олголт: төлбөр бүр `PENDING → PAID` нөхцөлт update-ээр (нэг л удаа амжина), үе нь
 * `subscription_periods`-д (subscription, starts_at) болон payment_id unique, lot-ын payment_id
 * unique — бүгд кредит олголттой **нэг transaction-д**, subscription-ийн мөрийг түгжээд.
 * Төлбөрийн төлөвийг callback-ийн body-оос биш, QPay payment check-ээр (картаар бол charge-ийн
 * хариугаар) тогтооно.
 */
@Injectable()
export class SubscriptionsService implements OnModuleInit {
  private readonly log = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly plans: SubscriptionPlansService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(QPAY) private readonly qpay: QPayAdapter,
    @Inject(ENV) private readonly env: Env,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(SUBSCRIPTION_RENEW_JOB, async () => {
      await this.runRenewals();
    });
    await this.queue.schedule(SUBSCRIPTION_RENEW_JOB, SUBSCRIPTION_RENEW_CRON);
  }

  // ---- Хэрэглэгч ---------------------------------------------------------------

  async overview(userId: string): Promise<SubscriptionOverview> {
    const [sub, card] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } }),
      this.prisma.paymentCard.findUnique({ where: { userId } }),
    ]);
    const pending = sub
      ? await this.prisma.payment.findFirst({
          where: { subscriptionId: sub.id, status: 'PENDING', method: 'INVOICE' },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    return {
      subscription: sub ? toSubscriptionView(sub) : null,
      pendingPayment: pending ? toPaymentView(pending) : null,
      card: card ? { status: card.status, maskedPan: card.maskedPan, brand: card.brand } : null,
      cardSupported: this.qpay.cardTokensSupported,
    };
  }

  /**
   * Багц сонгож эхлэх (эсвэл PAUSED/CANCELED-ээс өөр багцаар дахин идэвхжүүлэх). Карт холбосон
   * бол шууд картаар, үгүй/амжилтгүй бол QPay нэхэмжлэх. Төлөв ACTIVE болох нь төлбөр ороход.
   */
  async start(userId: string, planId: string): Promise<SubscriptionActionResult> {
    const plan = await this.plans.purchasable(planId);
    let sub = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    if (!sub) {
      try {
        sub = await this.prisma.subscription.create({ data: { userId, planId }, include: { plan: true } });
      } catch (err) {
        if (isUniqueViolation(err)) throw E.busy();
        throw err;
      }
    } else {
      assertAction('start', sub.status);
      await this.claim(sub, sub.status === 'INCOMPLETE' ? { planId } : {});
      await this.closePending(sub.id);
      sub = await this.reloadStartable(sub.id, 'start');
    }
    return this.beginPayment(sub, plan);
  }

  /** Ижил багцаар дахин идэвхжүүлэх (PAUSED/CANCELED). Шинэ үе төлбөр орох мөчөөс. */
  async reactivate(userId: string): Promise<SubscriptionActionResult> {
    const sub = await this.own(userId);
    assertAction('reactivate', sub.status);
    const plan = await this.plans.purchasable(sub.planId);
    await this.claim(sub);
    await this.closePending(sub.id);
    return this.beginPayment(await this.reloadStartable(sub.id, 'reactivate'), plan);
  }

  /** Цуцлах: цаашид сунгагдахгүй, олгосон кредит хэвээр. Нээлттэй нэхэмжлэхийг цуцална. */
  async cancel(userId: string): Promise<SubscriptionOverview> {
    let sub = await this.own(userId);
    assertAction('cancel', sub.status);
    await this.claim(sub);
    // Цуцлахаас өмнө төлөгдчихсөн нэхэмжлэх байвал түүнийг эхлээд олгоно (мөнгө алдагдахгүй).
    await this.closePending(sub.id);
    sub = await this.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: true } });
    assertAction('cancel', sub.status);
    assertTransition(sub.status, 'CANCELED');
    const now = new Date();
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: sub.id, status: sub.status },
      data: { status: 'CANCELED', canceledAt: now, pastDueSince: null },
    });
    if (count === 0) throw E.busy();
    await this.notify(userId, 'SUBSCRIPTION_CANCELED', {
      plan: sub.plan.name,
      until: sub.currentPeriodEnd && sub.currentPeriodEnd > now ? formatDay(sub.currentPeriodEnd) : formatDay(now),
    });
    return this.overview(userId);
  }

  /** PAST_DUE: сунгалтын нэхэмжлэх (байгаа бол түүнийг) буцаана. */
  async pay(userId: string): Promise<SubscriptionActionResult> {
    const sub = await this.own(userId);
    assertAction('pay', sub.status);
    const payment = await this.issueInvoice(sub, sub.plan, sub.currentPeriodEnd, true);
    return { overview: await this.overview(userId), payment: toPaymentView(payment) };
  }

  async getPayment(userId: string, id: string): Promise<SubscriptionPaymentView> {
    return toPaymentView(await this.ownPayment(userId, id));
  }

  /** "Төлбөр шалгах" — callback ирээгүй үед. */
  async checkPayment(userId: string, id: string): Promise<SubscriptionPaymentView> {
    await this.ownPayment(userId, id);
    return toPaymentView(await this.verifyInvoice(id, true));
  }

  // ---- Админы тохирол (ticket 22) ----------------------------------------------------

  /** Админ "дахин шалгах": PENDING нэхэмжлэхийг QPay-ээс шалгаж, төлөгдсөн бол ердийн урсгалаар олгоно. */
  async recheckForAdmin(paymentId: string): Promise<Payment> {
    return this.verifyInvoice(paymentId, true);
  }

  /**
   * Админ "олгох": мөнгө орсон нь батлагдсан PENDING төлбөрийг (жишээ нь картаар татагдсан ч олголтын
   * transaction унасан) ердийн `settle`-ээр — үе + кредит + ACTIVE — нэг transaction-д, audit-тай.
   * Төлбөр PENDING биш болсон бол false (дуудагч шийднэ).
   */
  async settleByAdmin(payment: Payment, admin: AdminSettle): Promise<boolean> {
    if (payment.purpose !== 'SUBSCRIPTION') throw new Error(`Payment ${payment.id}: subscription биш`);
    return this.settle(
      payment.id,
      { providerPaymentId: payment.providerPaymentId, paidAmountMnt: payment.paidAmountMnt ?? payment.amountMnt },
      admin,
    );
  }

  /** QPay callback: URL-ийн токеноор төлбөрийг олж, QPay-ээс дахин шалгана. Body-д итгэхгүй. */
  async handleCallback(token: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({ where: { callbackToken: token } });
    if (!payment || payment.purpose !== 'SUBSCRIPTION') return null;
    return this.verifyInvoice(payment.id, false);
  }

  // ---- Карт ------------------------------------------------------------------------

  async startCard(userId: string): Promise<{ redirectUrl: string }> {
    if (!this.qpay.cardTokensSupported) throw E.cardNotSupported();
    const existing = await this.prisma.paymentCard.findUnique({ where: { userId } });
    if (existing?.status === 'ACTIVE') throw E.cardAlreadyLinked();
    let reg;
    try {
      reg = await this.qpay.registerCard({ customerRef: userId, returnUrl: `${this.webBase()}/subscription` });
    } catch (err) {
      this.log.warn(`QPay карт бүртгэл эхлүүлж чадсангүй: ${(err as Error).message}`);
      throw CreditErrors.providerUnavailable();
    }
    await this.prisma.paymentCard.upsert({
      where: { userId },
      create: { userId, registrationId: reg.registrationId },
      update: { registrationId: reg.registrationId, status: 'PENDING', token: null, maskedPan: null, brand: null },
    });
    return { redirectUrl: reg.redirectUrl };
  }

  /** Hosted хуудаснаас буцаж ирэхэд: бүртгэл дууссан эсэхийг QPay-ээс асууна. */
  async checkCard(userId: string): Promise<SubscriptionOverview> {
    const card = await this.prisma.paymentCard.findUnique({ where: { userId } });
    if (!card) throw E.cardNotFound();
    if (card.status === 'PENDING') {
      let status;
      try {
        status = await this.qpay.getCardRegistration(card.registrationId);
      } catch (err) {
        this.log.warn(`QPay карт бүртгэл шалгаж чадсангүй: ${(err as Error).message}`);
        throw CreditErrors.providerUnavailable();
      }
      if (status.status === 'ACTIVE' && status.token) {
        await this.prisma.paymentCard.updateMany({
          where: { id: card.id, status: 'PENDING' },
          data: { status: 'ACTIVE', token: status.token, maskedPan: status.maskedPan, brand: status.brand },
        });
      } else if (status.status === 'FAILED') {
        await this.prisma.paymentCard.deleteMany({ where: { id: card.id, status: 'PENDING' } });
      }
    }
    return this.overview(userId);
  }

  async removeCard(userId: string): Promise<SubscriptionOverview> {
    const card = await this.prisma.paymentCard.findUnique({ where: { userId } });
    if (!card) throw E.cardNotFound();
    await this.prisma.paymentCard.delete({ where: { id: card.id } });
    if (card.token) {
      await this.qpay.removeCard(card.token).catch((err: Error) => {
        this.log.warn(`QPay картын токен устгаж чадсангүй (${card.id}): ${err.message}`);
      });
    }
    return this.overview(userId);
  }

  // ---- Cron: сунгалт ------------------------------------------------------------------

  /**
   * Өдөр тутмын сунгалт. Idempotent, зэрэг ажиллахад аюулгүй:
   * 1. ACTIVE, үе дууссан → нөхцөлт update-ээр PAST_DUE болгож "эзэмшинэ" (зөвхөн нэг ажил амжина),
   *    картаар төлөхийг оролдоно; амжилттай бол ACTIVE, үгүй бол нэхэмжлэх + мэдэгдэл.
   * 2. PAST_DUE → нээлттэй нэхэмжлэхийг QPay-ээс шалгана (callback алдагдсан бол); 3 хоног
   *    хэтэрсэн бол PAUSED + мэдэгдэл; нэхэмжлэх алга бол (QPay түр унасан г.м) дахин үүсгэнэ.
   */
  async runRenewals(now = new Date()): Promise<RenewalReport> {
    const report: RenewalReport = { renewed: 0, pastDue: 0, paused: 0, invoiced: 0 };

    const due = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lte: now } },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'asc' },
      take: BATCH,
    });
    for (const sub of due) {
      try {
        await this.renewOne(sub, now, report);
      } catch (err) {
        this.log.error(`Сунгалт амжилтгүй (${sub.id}): ${(err as Error).message}`);
      }
    }

    const pastDue = await this.prisma.subscription.findMany({
      where: { status: 'PAST_DUE' },
      include: { plan: true },
      orderBy: { pastDueSince: 'asc' },
      take: BATCH,
    });
    for (const sub of pastDue) {
      try {
        await this.followUpPastDue(sub, now, report);
      } catch (err) {
        this.log.error(`PAST_DUE боловсруулалт амжилтгүй (${sub.id}): ${(err as Error).message}`);
      }
    }

    if (report.renewed + report.pastDue + report.paused + report.invoiced > 0) {
      this.log.log(
        `Сунгалт: амжилттай ${report.renewed}, хоцорсон ${report.pastDue}, зогссон ${report.paused}, нэхэмжлэх ${report.invoiced}`,
      );
    }
    return report;
  }

  private async renewOne(sub: SubWithPlan, now: Date, report: RenewalReport): Promise<void> {
    assertTransition(sub.status, 'PAST_DUE');
    const dueAt = sub.currentPeriodEnd!;
    // Эзэмших: давхар/зэрэг cron-оос зөвхөн нэг нь амжина.
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: sub.id, status: 'ACTIVE', currentPeriodEnd: dueAt },
      data: { status: 'PAST_DUE', pastDueSince: now },
    });
    if (count === 0) return;
    const claimed = { ...sub, status: 'PAST_DUE' as const, pastDueSince: now };

    const charged = await this.tryCard(claimed, sub.plan, dueAt);
    if (charged?.status === 'PAID') {
      report.renewed++;
      return;
    }
    // Картаас мөнгө татагдсан ч дүн таарахгүй: давхар нэхэмжлэхгүй, админ шийднэ (audit).
    if (charged?.status === 'AMOUNT_MISMATCH') return;
    report.pastDue++;
    let invoice: Payment | null = null;
    try {
      invoice = await this.issueInvoice(claimed, sub.plan, dueAt, false);
      report.invoiced++;
    } catch (err) {
      // Дараагийн cron (эсвэл хэрэглэгчийн "Төлөх") дахин оролдоно.
      this.log.warn(`Сунгалтын нэхэмжлэх үүсгэж чадсангүй (${sub.id}): ${(err as Error).message}`);
    }
    await this.notify(sub.userId, 'SUBSCRIPTION_PAYMENT_FAILED', {
      plan: sub.plan.name,
      amount: formatMnt(invoice?.amountMnt ?? sub.plan.priceMnt),
      pauseAt: formatDay(new Date(now.getTime() + GRACE_DAYS * DAY)),
      reason: charged ? t('subscriptions.cardDeclined') : t('subscriptions.noCard'),
    });
  }

  private async followUpPastDue(sub: SubWithPlan, now: Date, report: RenewalReport): Promise<void> {
    const pending = await this.prisma.payment.findMany({
      where: { subscriptionId: sub.id, status: 'PENDING', method: 'INVOICE' },
    });
    for (const p of pending) {
      const verified = await this.verifyInvoice(p.id, false).catch(() => null);
      if (verified?.status === 'PAID') {
        report.renewed++;
        return;
      }
    }

    const cutoff = new Date(now.getTime() - GRACE_DAYS * DAY);
    if (sub.pastDueSince && sub.pastDueSince <= cutoff) {
      assertTransition(sub.status, 'PAUSED');
      await this.closePending(sub.id);
      const { count } = await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'PAST_DUE', pastDueSince: { lte: cutoff } },
        data: { status: 'PAUSED', pausedAt: now },
      });
      if (count === 1) {
        report.paused++;
        await this.notify(sub.userId, 'SUBSCRIPTION_PAUSED', { plan: sub.plan.name });
      }
      return;
    }

    const stale = sub.pastDueSince && sub.pastDueSince.getTime() <= now.getTime() - REISSUE_AFTER_MS;
    if (pending.length === 0 && stale && sub.currentPeriodEnd) {
      try {
        await this.issueInvoice(sub, sub.plan, sub.currentPeriodEnd, false);
        report.invoiced++;
      } catch (err) {
        this.log.warn(`Сунгалтын нэхэмжлэх (дахин) үүсгэж чадсангүй (${sub.id}): ${(err as Error).message}`);
      }
    }
  }

  // ---- Төлбөр -------------------------------------------------------------------

  /** Эхлэх/дахин идэвхжүүлэх төлбөр: карт → (амжилтгүй бол) нэхэмжлэх. */
  private async beginPayment(sub: SubWithPlan, plan: SubscriptionPlan): Promise<SubscriptionActionResult> {
    const charged = await this.tryCard(sub, plan, null);
    const payment =
      charged?.status === 'PAID' || charged?.status === 'AMOUNT_MISMATCH'
        ? charged
        : await this.issueInvoice(sub, plan, null, true);
    return { overview: await this.overview(sub.userId), payment: toPaymentView(payment) };
  }

  /**
   * Холбосон картаар төлөх. Карт байхгүй бол null. Банк татгалзсан/QPay алдаа → FAILED төлбөр
   * (дуудагч нэхэмжлэх рүү шилжинэ). Амжилттай бол тэр дороо олгоно.
   */
  private async tryCard(sub: Subscription, plan: SubscriptionPlan, renewalFor: Date | null): Promise<Payment | null> {
    if (!this.qpay.cardTokensSupported) return null;
    const card = await this.prisma.paymentCard.findUnique({ where: { userId: sub.userId } });
    if (!card || card.status !== 'ACTIVE' || !card.token) return null;

    const payment = await this.createPayment(sub, plan, renewalFor, 'CARD');
    let result;
    try {
      result = await this.qpay.chargeCard({
        cardToken: card.token,
        senderInvoiceNo: payment.id.replace(/-/g, ''),
        description: this.description(plan),
        amountMnt: payment.amountMnt,
      });
    } catch (err) {
      this.log.warn(`Картаар төлөх амжилтгүй (${payment.id}): ${(err as Error).message}`);
      return this.failPayment(payment, 'provider_error');
    }
    if (result.status !== 'PAID') return this.failPayment(payment, result.reason ?? 'declined');
    // Мөнгө татагдсан: олголт амжилтгүй болбол PENDING + providerPaymentId үлдэж, админ харна.
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerPaymentId: result.providerPaymentId, lastCheckedAt: new Date() },
    });
    if (result.amountMnt !== payment.amountMnt) return this.markMismatch(payment, result.amountMnt, [result.providerPaymentId]);
    await this.settle(payment.id, { providerPaymentId: result.providerPaymentId, paidAmountMnt: result.amountMnt });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  /**
   * QPay нэхэмжлэх. Сунгалтын (renewalFor) нэхэмжлэх нэг үед нэг л нээлттэй/төлөгдсөн байна
   * (DB-ийн partial unique index) — давхар cron/дарахад байгааг нь буцаана.
   */
  private async issueInvoice(
    sub: Subscription,
    plan: SubscriptionPlan,
    renewalFor: Date | null,
    userInitiated: boolean,
  ): Promise<Payment> {
    if (renewalFor) {
      const existing = await this.findRenewalInvoice(sub.id, renewalFor);
      if (existing) return existing;
    }
    let payment: Payment;
    try {
      payment = await this.createPayment(sub, plan, renewalFor, 'INVOICE');
    } catch (err) {
      if (renewalFor && isUniqueViolation(err)) {
        const existing = await this.findRenewalInvoice(sub.id, renewalFor);
        if (existing) return existing;
      }
      throw err;
    }

    let invoice;
    try {
      invoice = await this.qpay.createInvoice({
        senderInvoiceNo: payment.id.replace(/-/g, ''),
        receiverCode: 'terminal',
        description: this.description(plan),
        amountMnt: payment.amountMnt,
        callbackUrl: `${this.callbackBase()}/payments/qpay/subscription-callback/${payment.callbackToken}`,
      });
    } catch (err) {
      this.log.error(`QPay нэхэмжлэх үүсгэж чадсангүй (${payment.id}): ${(err as Error).message}`);
      await this.failPayment(payment, 'invoice_create_failed');
      if (userInitiated) throw CreditErrors.providerUnavailable();
      throw err;
    }
    return this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerInvoiceId: invoice.invoiceId,
        qrText: invoice.qrText,
        qrImage: invoice.qrImage,
        shortUrl: invoice.shortUrl,
        deeplinks: invoice.urls
          .filter((u) => typeof u.link === 'string' && !/^\s*(javascript|data|vbscript|file):/i.test(u.link))
          .map((u) => ({
            name: String(u.name ?? ''),
            description: String(u.description ?? ''),
            logo: typeof u.logo === 'string' && u.logo.startsWith('https://') ? u.logo : '',
            link: u.link,
          })),
      },
    });
  }

  private findRenewalInvoice(subscriptionId: string, renewalFor: Date): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { subscriptionId, renewalFor, method: 'INVOICE', status: { in: ['PENDING', 'PAID'] } },
    });
  }

  private async createPayment(
    sub: Subscription,
    plan: SubscriptionPlan,
    renewalFor: Date | null,
    method: 'INVOICE' | 'CARD',
  ): Promise<Payment> {
    const creditPriceMnt = await this.settings.get('creditPriceMnt');
    return this.prisma.payment.create({
      data: {
        userId: sub.userId,
        purpose: 'SUBSCRIPTION',
        subscriptionId: sub.id,
        planId: plan.id,
        renewalFor,
        method,
        amountMnt: plan.priceMnt,
        credits: plan.credits,
        creditPriceMnt,
        callbackToken: randomBytes(32).toString('base64url'),
      },
    });
  }

  private async failPayment(payment: Payment, reason: string): Promise<Payment> {
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: reason.slice(0, 200), lastCheckedAt: new Date() },
    });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  /** Нэхэмжлэхийг QPay-ээс шалгаж, төлөгдсөн бол яг нэг удаа олгоно (топ-апын адил). */
  private async verifyInvoice(paymentId: string, userInitiated: boolean): Promise<Payment> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.purpose !== 'SUBSCRIPTION' || payment.status !== 'PENDING' || !payment.providerInvoiceId) {
      return payment;
    }
    let check;
    try {
      check = await this.qpay.checkInvoice(payment.providerInvoiceId);
    } catch (err) {
      this.log.warn(`QPay payment check амжилтгүй (${payment.id}): ${(err as Error).message}`);
      if (userInitiated) throw CreditErrors.providerUnavailable();
      throw err;
    }
    const paidRows = check.rows.filter((r) => r.status === 'PAID');
    if (paidRows.length === 0) {
      return this.prisma.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: new Date() } });
    }
    if (check.paidAmountMnt !== payment.amountMnt) {
      return this.markMismatch(payment, check.paidAmountMnt, paidRows.map((r) => r.paymentId));
    }
    await this.settle(payment.id, { providerPaymentId: paidRows[0]!.paymentId, paidAmountMnt: check.paidAmountMnt });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  private async markMismatch(payment: Payment, paidAmountMnt: number, providerPaymentIds: (string | null)[]) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'AMOUNT_MISMATCH', paidAmountMnt, lastCheckedAt: new Date() },
      });
      if (count === 0) return;
      await this.audit.record(tx, {
        actorId: null,
        action: 'payment.amount_mismatch',
        targetType: 'payment',
        targetId: payment.id,
        before: { amountMnt: payment.amountMnt },
        after: { paidAmountMnt, providerPaymentIds },
      });
      this.log.error(`Төлбөрийн дүн таарахгүй (${payment.id}): ${payment.amountMnt}₮ ≠ ${paidAmountMnt}₮`);
    });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  /**
   * Төлөгдсөн төлбөр → НЭГ transaction-д: payment PAID + үе + `SUBSCRIPTION_GRANT` lot + subscription
   * ACTIVE, үе урагшилна. Subscription-ийн мөрийг түгжинэ. Давхар дуудалт → null (юу ч хийхгүй).
   */
  private async settle(
    paymentId: string,
    provider: { providerPaymentId: string | null; paidAmountMnt: number },
    admin?: AdminSettle,
  ): Promise<boolean> {
    const now = new Date();
    const done = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (!payment.subscriptionId || !payment.planId) throw new Error(`Payment ${paymentId}: subscription алга`);
      await lockSubscription(tx, payment.subscriptionId);

      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: now,
          paidAmountMnt: provider.paidAmountMnt,
          providerPaymentId: provider.providerPaymentId,
          lastCheckedAt: now,
          ...(admin
            ? { resolvedAt: now, resolvedById: admin.actorId, resolution: 'GRANTED' as const, resolutionNote: admin.note }
            : {}),
        },
      });
      if (count === 0) return null; // өөр callback/шалгалт/cron түрүүлсэн
      if (admin) await admin.audit(tx);

      const sub = await tx.subscription.findUniqueOrThrow({ where: { id: payment.subscriptionId } });
      const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: payment.planId } });
      // Бүх төлвөөс ACTIVE руу шилжих боломжтой (TRANSITIONS); төлбөр орсон тул заавал олгоно.
      if (!canTransition(sub.status, 'ACTIVE')) throw new Error(`Subscription ${sub.id}: ${sub.status} → ACTIVE`);

      const startsAt = periodStart(sub, payment, now);
      const endsAt = addMonths(startsAt, 1);
      const period = await tx.subscriptionPeriod.create({
        data: { subscriptionId: sub.id, paymentId: payment.id, startsAt, endsAt, credits: payment.credits },
      });
      const grant = await this.credits.grant(tx, {
        userId: payment.userId,
        credits: payment.credits,
        source: 'SUBSCRIPTION_GRANT',
        paymentId: payment.id,
        refType: 'subscription_period',
        refId: period.id,
        now,
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          planId: plan.id,
          currentPeriodStart: startsAt,
          currentPeriodEnd: endsAt,
          pastDueSince: null,
          pausedAt: null,
          canceledAt: null,
        },
      });
      return { payment, plan, endsAt, expiresAt: grant.expiresAt, renewal: sub.status === 'PAST_DUE' || sub.status === 'ACTIVE' };
    }, CREDIT_TX_OPTIONS);

    if (done) {
      await this.notify(done.payment.userId, done.renewal ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_ACTIVATED', {
        plan: done.plan.name,
        credits: done.payment.credits,
        amount: formatMnt(done.payment.amountMnt),
        paymentId: done.payment.id.slice(0, 8).toUpperCase(),
        until: formatDay(done.endsAt),
        expiresAt: formatDay(done.expiresAt),
      });
    }
    return done !== null;
  }

  /**
   * Нээлттэй нэхэмжлэхүүдийг хаана (цуцлах, зогсоох, дахин эхлэхэд). Дараалал: QPay дээр цуцлах
   * (цаашид төлөгдөхгүй) → дахин шалгах (өмнө нь төлөгдсөн бол олгоно) → PENDING бол CANCELED.
   */
  private async closePending(subscriptionId: string): Promise<void> {
    const pending = await this.prisma.payment.findMany({
      where: { subscriptionId, status: 'PENDING', method: 'INVOICE' },
    });
    for (const p of pending) {
      if (p.providerInvoiceId) {
        await this.qpay.cancelInvoice(p.providerInvoiceId).catch((err: Error) => {
          this.log.warn(`QPay нэхэмжлэх цуцалж чадсангүй (${p.id}): ${err.message}`);
        });
        const verified = await this.verifyInvoice(p.id, false).catch(() => null);
        if (verified && verified.status !== 'PENDING') continue;
      }
      await this.prisma.payment.updateMany({
        where: { id: p.id, status: 'PENDING' },
        data: { status: 'CANCELED', lastCheckedAt: new Date() },
      });
    }
  }

  // ---- Туслах -------------------------------------------------------------------

  /**
   * Optimistic түгжээ: `updatedAt` өөрчлөгдөөгүй бол л үргэлжилнэ → нэг хэрэглэгчийн зэрэг
   * эхлэх/цуцлах хүсэлтээс нэг нь л (давхар картаар татах, давхар нэхэмжлэхгүй).
   */
  private async claim(sub: Subscription, data: Prisma.SubscriptionUncheckedUpdateManyInput = {}): Promise<void> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: sub.id, status: sub.status, updatedAt: sub.updatedAt },
      data: { ...data, updatedAt: new Date() },
    });
    if (count === 0) throw E.busy();
  }

  private async reloadStartable(id: string, action: 'start' | 'reactivate'): Promise<SubWithPlan> {
    const sub = await this.prisma.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
    // closePending нь төлөгдсөн нэхэмжлэхийг олгож ACTIVE болгосон байж болно.
    assertAction(action, sub.status);
    return sub;
  }

  private async own(userId: string): Promise<SubWithPlan> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    if (!sub) throw E.notFound();
    return sub;
  }

  private async ownPayment(userId: string, id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.userId !== userId || payment.purpose !== 'SUBSCRIPTION') {
      throw CreditErrors.paymentNotFound();
    }
    return payment;
  }

  private async notify(userId: string, type: NotificationType, params: Record<string, string | number>) {
    try {
      await this.notifications.notify({ userId, type, params, link: '/subscription' });
    } catch (err) {
      this.log.error(`Мэдэгдэл үүсгэж чадсангүй (${type}, ${userId}): ${(err as Error).message}`);
    }
  }

  private description(plan: SubscriptionPlan): string {
    return t('subscriptions.invoiceDescription', { brand: BRAND.name, plan: plan.name, credits: plan.credits });
  }

  private callbackBase(): string {
    return (this.env.QPAY_CALLBACK_BASE_URL ?? `${this.env.PUBLIC_WEB_URL}/api`).replace(/\/+$/, '');
  }

  private webBase(): string {
    return this.env.PUBLIC_WEB_URL.replace(/\/+$/, '');
  }
}

/**
 * Шинэ үеийн эхлэл:
 * - хугацаа хэтэрсэн сунгалт (PAST_DUE, нэхэмжлэх нь яг одоогийн үеийн төгсгөлд) → үе тасралтгүй
 *   үргэлжилнэ (`renewalFor`-оос);
 * - ACTIVE хэвээр (ховор: хоёр төлбөр зэрэг) → дараагийн үе урьдчилж;
 * - INCOMPLETE / PAUSED / CANCELED → төлбөр орсон мөчөөс.
 */
function periodStart(sub: Subscription, payment: Payment, now: Date): Date {
  const end = sub.currentPeriodEnd;
  if (payment.renewalFor && end && payment.renewalFor.getTime() === end.getTime() && sub.status === 'PAST_DUE') {
    return end;
  }
  if (sub.status === 'ACTIVE' && end && end > now) return end;
  return now;
}

async function lockSubscription(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE id = ${id}::uuid FOR UPDATE`;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ulaanbaatar' });
}

function formatMnt(n: number): string {
  return new Intl.NumberFormat('mn-MN').format(n);
}

export function toSubscriptionView(sub: SubWithPlan): SubscriptionView {
  return {
    id: sub.id,
    status: sub.status,
    plan: toPlanView(sub.plan),
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    nextRenewalAt: sub.status === 'ACTIVE' ? (sub.currentPeriodEnd?.toISOString() ?? null) : null,
    pastDueSince: sub.pastDueSince?.toISOString() ?? null,
    pauseAt:
      sub.status === 'PAST_DUE' && sub.pastDueSince
        ? new Date(sub.pastDueSince.getTime() + GRACE_DAYS * DAY).toISOString()
        : null,
    canceledAt: sub.canceledAt?.toISOString() ?? null,
    pausedAt: sub.pausedAt?.toISOString() ?? null,
  };
}

export function toPaymentView(p: Payment): SubscriptionPaymentView {
  const open = p.status === 'PENDING' && p.method === 'INVOICE';
  return {
    id: p.id,
    status: p.status,
    method: p.method,
    amountMnt: p.amountMnt,
    credits: p.credits,
    renewalFor: p.renewalFor?.toISOString() ?? null,
    qrImage: open ? p.qrImage : null,
    qrText: open ? p.qrText : null,
    shortUrl: open ? p.shortUrl : null,
    deeplinks: open ? (p.deeplinks as unknown as QPayDeeplinkView[]) : [],
    failureReason: p.failureReason,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
