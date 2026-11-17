import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Payment } from '@lms/db';
import { BRAND, type QPayDeeplinkView, type TopupView } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { SettingsService } from '../admin/settings.service';
import { QPAY, type QPayAdapter } from '../adapters/qpay';
import type { CurrentUserInfo } from '../auth/auth.guard';
import { ENV, type Env } from '../env';
import { t } from '../i18n';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CREDIT_TX_OPTIONS, CreditsService } from './credits.service';
import { CreditErrors as E } from './errors';
import { CreditPackagesService } from './packages.service';

/**
 * QPay-аар кредит цэнэглэх. Төлбөрийн төлөвийг **зөвхөн** QPay payment check-ээр тогтооно:
 * callback-ийн body-д итгэхгүй, callback нь зөвхөн "шалга" гэсэн дохио.
 *
 * Exactly-once: `PENDING → PAID` нөхцөлт update + lot-ын `paymentId` unique, хоёулаа
 * кредит олголттой нэг transaction-д. Давхар/зэрэг callback, хэрэглэгчийн шалгалт аль нь ч
 * хамгийн ихдээ нэг удаа кредит олгоно.
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly packages: CreditPackagesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(QPAY) private readonly qpay: QPayAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createTopup(user: CurrentUserInfo, packageId: string): Promise<TopupView> {
    const pkg = await this.packages.purchasable(packageId, user.roles.includes('ADMIN'));
    const creditPriceMnt = await this.settings.get('creditPriceMnt');
    const callbackToken = randomBytes(32).toString('base64url');
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        amountMnt: pkg.priceMnt,
        credits: pkg.credits,
        creditPriceMnt,
        isTest: pkg.isTest,
        callbackToken,
      },
    });

    let invoice;
    try {
      invoice = await this.qpay.createInvoice({
        senderInvoiceNo: payment.id.replace(/-/g, ''),
        receiverCode: 'terminal',
        description: t('payments.invoiceDescription', { brand: BRAND.name, credits: pkg.credits }),
        amountMnt: pkg.priceMnt,
        callbackUrl: `${this.callbackBase()}/payments/qpay/callback/${callbackToken}`,
      });
    } catch (err) {
      this.log.error(`QPay нэхэмжлэх үүсгэж чадсангүй (${payment.id}): ${(err as Error).message}`);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw E.providerUnavailable();
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerInvoiceId: invoice.invoiceId,
        qrText: invoice.qrText,
        qrImage: invoice.qrImage,
        shortUrl: invoice.shortUrl,
        // Банкны апп-ын deeplink (`khanbank://…`) — browser-т аюултай scheme-ийг хасна.
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
    return toView(updated);
  }

  async getOwn(userId: string, id: string): Promise<TopupView> {
    return toView(await this.own(userId, id));
  }

  /** "Төлбөр шалгах" товч — callback ирээгүй үед хэрэглэгч өөрөө. */
  async checkOwn(userId: string, id: string): Promise<TopupView> {
    await this.own(userId, id);
    return toView(await this.verify(id, true));
  }

  /** Админы тохирол (ticket 22): PENDING цэнэглэлтийг QPay-ээс дахин шалгаж, төлөгдсөн бол ердийн урсгалаар олгоно. */
  async recheckForAdmin(paymentId: string): Promise<Payment> {
    return this.verify(paymentId, true);
  }

  /**
   * QPay callback. URL дахь токен нь төлбөрийг заана; body-г огт уншихгүй.
   * Олдохгүй бол null (controller 404).
   */
  async handleCallback(token: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({ where: { callbackToken: token } });
    // Subscription төлбөр (ticket 17) өөрийн callback-тэй — энд зөвхөн кредит цэнэглэлт.
    if (!payment || payment.purpose !== 'CREDIT_TOPUP') return null;
    return this.verify(payment.id, false);
  }

  /** QPay-аас дахин шалгаж, төлөгдсөн бол яг нэг удаа кредит олгоно. */
  private async verify(paymentId: string, userInitiated: boolean): Promise<Payment> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.purpose !== 'CREDIT_TOPUP' || payment.status !== 'PENDING' || !payment.providerInvoiceId) {
      return payment;
    }

    let check;
    try {
      check = await this.qpay.checkInvoice(payment.providerInvoiceId);
    } catch (err) {
      this.log.warn(`QPay payment check амжилтгүй (${payment.id}): ${(err as Error).message}`);
      if (userInitiated) throw E.providerUnavailable();
      throw err;
    }
    const now = new Date();
    const paidRows = check.rows.filter((r) => r.status === 'PAID');
    if (paidRows.length === 0) {
      return this.prisma.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: now } });
    }

    if (check.paidAmountMnt !== payment.amountMnt) {
      // Дүн таарахгүй: кредит олгохгүй, админ шалгана.
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'AMOUNT_MISMATCH', paidAmountMnt: check.paidAmountMnt, lastCheckedAt: now },
        });
        if (count === 0) return;
        await this.audit.record(tx, {
          actorId: null,
          action: 'payment.amount_mismatch',
          targetType: 'payment',
          targetId: payment.id,
          before: { amountMnt: payment.amountMnt },
          after: { paidAmountMnt: check.paidAmountMnt, providerPaymentIds: paidRows.map((r) => r.paymentId) },
        });
        this.log.error(
          `Төлбөрийн дүн таарахгүй (${payment.id}): нэхэмжлэх ${payment.amountMnt}₮, төлсөн ${check.paidAmountMnt}₮`,
        );
      });
      return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }

    const grant = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: now,
          paidAmountMnt: check.paidAmountMnt,
          providerPaymentId: paidRows[0]!.paymentId,
          lastCheckedAt: now,
        },
      });
      if (count === 0) return null; // өөр callback/шалгалт түрүүлж олгосон
      return this.credits.grant(tx, {
        userId: payment.userId,
        credits: payment.credits,
        source: 'TOPUP',
        paymentId: payment.id,
        isTest: payment.isTest,
        now,
      });
    }, CREDIT_TX_OPTIONS);

    if (grant) {
      await this.notifications.notify({
        userId: payment.userId,
        type: 'CREDIT_TOPUP_PAID',
        params: {
          credits: payment.credits,
          amount: new Intl.NumberFormat('mn-MN').format(payment.amountMnt),
          paymentId: payment.id.slice(0, 8).toUpperCase(),
          expiresAt: grant.expiresAt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ulaanbaatar' }),
        },
        link: '/credits',
      });
    }
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  private async own(userId: string, id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.userId !== userId || payment.purpose !== 'CREDIT_TOPUP') throw E.paymentNotFound();
    return payment;
  }

  private callbackBase(): string {
    return (this.env.QPAY_CALLBACK_BASE_URL ?? `${this.env.PUBLIC_WEB_URL}/api`).replace(/\/+$/, '');
  }
}

function toView(p: Payment): TopupView {
  return {
    id: p.id,
    status: p.status,
    credits: p.credits,
    amountMnt: p.amountMnt,
    isTest: p.isTest,
    qrImage: p.status === 'PENDING' ? p.qrImage : null,
    qrText: p.status === 'PENDING' ? p.qrText : null,
    shortUrl: p.status === 'PENDING' ? p.shortUrl : null,
    deeplinks: p.status === 'PENDING' ? (p.deeplinks as unknown as QPayDeeplinkView[]) : [],
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
