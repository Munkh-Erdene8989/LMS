import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BankAccount, type TeacherApplicationStatus } from '@lms/db';
import type {
  AdminTeacherApplicationView,
  BankAccountView,
  BankCode,
  MyTeacherApplication,
  TeacherApplicationView,
} from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { LegalService } from '../admin/legal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface BankInput {
  bank: BankCode;
  accountNumber: string;
  holderName: string;
}

export interface ApplicationInput {
  displayName: string;
  bio: string;
  expertise: string;
  sampleUrl: string;
  /** Хэрэглэгчийн уншиж зөвшөөрсөн багшийн гэрээний хувилбар */
  agreementVersion: number;
  bankAccount: BankInput;
}

const applicationInclude = {
  agreementAcceptance: { include: { document: { select: { version: true } } } },
} as const;
type ApplicationRow = Prisma.TeacherApplicationGetPayload<{ include: typeof applicationInclude }>;

const err = {
  phoneRequired: () =>
    new ForbiddenException({ code: 'PHONE_REQUIRED', message: 'Багш болохын тулд утасны дугаараа баталгаажуулна уу.' }),
  alreadyTeacher: () => new ConflictException({ code: 'ALREADY_TEACHER', message: 'Та аль хэдийн багш болсон.' }),
  underReview: () =>
    new ConflictException({ code: 'UNDER_REVIEW', message: 'Таны өргөдөл шалгагдаж байна.' }),
  agreementMissing: () =>
    new ConflictException({ code: 'AGREEMENT_NOT_PUBLISHED', message: 'Багшийн гэрээ хараахан нийтлэгдээгүй байна.' }),
  notFound: () => new NotFoundException({ code: 'NOT_FOUND', message: 'Өргөдөл олдсонгүй.' }),
  invalidStatus: () =>
    new ConflictException({ code: 'INVALID_STATUS', message: 'Өргөдөл шалгагдаж буй төлөвт биш байна.' }),
  bankForbidden: () =>
    new ForbiddenException({ code: 'FORBIDDEN', message: 'Банкны данс зөвхөн багш эсвэл өргөдөл гаргагчид.' }),
};

/**
 * Багшийн өргөдөл: SUBMITTED → APPROVED (TEACHER role) | REJECTED (шалтгаантай) → засаж дахин SUBMITTED.
 * Төлөвийн шилжилт бүр audit-д, үр дүн мэдэгдлээр (in-app + имэйл).
 */
@Injectable()
export class TeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async mine(userId: string): Promise<MyTeacherApplication> {
    const [user, application, bankAccount, agreement] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { roles: true, identifiers: { where: { type: 'PHONE' }, select: { id: true } } },
      }),
      this.prisma.teacherApplication.findUnique({ where: { userId }, include: applicationInclude }),
      this.prisma.bankAccount.findUnique({ where: { userId } }),
      this.legal.current('TEACHER_AGREEMENT'),
    ]);
    return {
      hasVerifiedPhone: user.identifiers.length > 0,
      isTeacher: user.roles.includes('TEACHER'),
      currentAgreementVersion: agreement?.version ?? null,
      application: application ? toView(application) : null,
      bankAccount: bankAccount ? toBankView(bankAccount) : null,
    };
  }

  /** Анх илгээх эсвэл буцаагдсаныг засаж дахин илгээх. */
  async submit(userId: string, input: ApplicationInput, ip?: string): Promise<MyTeacherApplication> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { roles: true, identifiers: { where: { type: 'PHONE' }, select: { id: true } } },
    });
    if (user.identifiers.length === 0) throw err.phoneRequired();
    if (user.roles.includes('TEACHER')) throw err.alreadyTeacher();

    const existing = await this.prisma.teacherApplication.findUnique({ where: { userId } });
    if (existing?.status === 'SUBMITTED') throw err.underReview();
    if (existing?.status === 'APPROVED') throw err.alreadyTeacher();

    if (!(await this.legal.current('TEACHER_AGREEMENT'))) throw err.agreementMissing();
    const acceptance = await this.legal.acceptCurrent(userId, 'TEACHER_AGREEMENT', input.agreementVersion, ip);

    const fields = {
      displayName: input.displayName,
      bio: input.bio,
      expertise: input.expertise,
      sampleUrl: input.sampleUrl,
      agreementAcceptanceId: acceptance.id,
      status: 'SUBMITTED' as const,
      submittedAt: new Date(),
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
    };

    await this.prisma.$transaction(async (tx) => {
      // Зэрэг хоёр илгээлт: зөвхөн "байхгүй" эсвэл "REJECTED" төлөвөөс шилжинэ.
      if (existing) {
        const { count } = await tx.teacherApplication.updateMany({
          where: { id: existing.id, status: 'REJECTED' },
          data: fields,
        });
        if (count === 0) throw err.underReview();
      } else {
        try {
          await tx.teacherApplication.create({ data: { userId, ...fields } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw err.underReview();
          throw e;
        }
      }
      await this.saveBank(tx, userId, input.bankAccount, ip);
      await this.audit.record(tx, {
        actorId: userId,
        action: existing ? 'teacher_application.resubmit' : 'teacher_application.submit',
        targetType: 'teacher_application',
        targetId: userId,
        after: { agreementVersion: acceptance.version },
        ip,
      });
    });
    return this.mine(userId);
  }

  async updateBankAccount(userId: string, input: BankInput, ip?: string): Promise<BankAccountView> {
    const [user, application] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { roles: true } }),
      this.prisma.teacherApplication.findUnique({ where: { userId }, select: { id: true } }),
    ]);
    if (!user.roles.includes('TEACHER') && !application) throw err.bankForbidden();

    const changed = await this.prisma.$transaction((tx) => this.saveBank(tx, userId, input, ip));
    if (changed) {
      // Payout-ийн данс солигдох нь эрсдэлтэй үйлдэл — хэрэглэгчид мэдэгдэнэ.
      await this.notifications.notify({
        userId,
        type: 'BANK_ACCOUNT_CHANGED',
        params: { account: maskAccount(input.accountNumber) },
        link: '/teacher/apply',
      });
    }
    return toBankView((await this.prisma.bankAccount.findUniqueOrThrow({ where: { userId } }))!);
  }

  // ---- админ ----------------------------------------------------------------

  async list(status: TeacherApplicationStatus): Promise<AdminTeacherApplicationView[]> {
    const rows = await this.prisma.teacherApplication.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' }, // хамгийн удаан хүлээсэн нь эхэндээ
      take: 200,
      include: {
        ...applicationInclude,
        reviewedBy: { select: { id: true, name: true } },
        user: { include: { identifiers: true, bankAccount: true } },
      },
    });
    return rows.map((r) => ({
      ...toView(r),
      user: {
        id: r.user.id,
        name: r.user.name,
        phone: r.user.identifiers.find((i) => i.type === 'PHONE')?.value ?? null,
        email: r.user.identifiers.find((i) => i.type === 'EMAIL')?.value ?? null,
      },
      bankAccount: r.user.bankAccount ? toBankView(r.user.bankAccount) : null,
      reviewedBy: r.reviewedBy,
    }));
  }

  async approve(id: string, adminId: string, ip?: string): Promise<void> {
    const app = await this.review(id, adminId, 'APPROVED', null, ip, async (tx, userId) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { roles: true } });
      if (!user.roles.includes('TEACHER')) {
        await tx.user.update({ where: { id: userId }, data: { roles: { set: [...user.roles, 'TEACHER'] } } });
      }
    });
    await this.notifications.notify({ userId: app.userId, type: 'TEACHER_APPLICATION_APPROVED', link: '/teacher/apply' });
  }

  async reject(id: string, adminId: string, reason: string, ip?: string): Promise<void> {
    const app = await this.review(id, adminId, 'REJECTED', reason, ip);
    await this.notifications.notify({
      userId: app.userId,
      type: 'TEACHER_APPLICATION_REJECTED',
      params: { reason },
      link: '/teacher/apply',
    });
  }

  private async review(
    id: string,
    adminId: string,
    status: 'APPROVED' | 'REJECTED',
    reason: string | null,
    ip: string | undefined,
    extra?: (tx: Prisma.TransactionClient, userId: string) => Promise<void>,
  ): Promise<{ userId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.teacherApplication.findUnique({ where: { id } });
      if (!app) throw err.notFound();
      // Хоёр админ зэрэг шийдвэрлэвэл зөвхөн нэг нь амжилттай.
      const { count } = await tx.teacherApplication.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: { status, reviewNote: reason, reviewedById: adminId, reviewedAt: new Date() },
      });
      if (count === 0) throw err.invalidStatus();
      await extra?.(tx, app.userId);
      await this.audit.record(tx, {
        actorId: adminId,
        action: status === 'APPROVED' ? 'teacher_application.approve' : 'teacher_application.reject',
        targetType: 'teacher_application',
        targetId: id,
        before: { status: 'SUBMITTED' },
        after: { status, ...(reason ? { reason } : {}) },
        ip,
      });
      return { userId: app.userId };
    });
  }

  /** Данс хадгална; өөрчлөгдсөн бол audit бичиж true буцаана. */
  private async saveBank(tx: Prisma.TransactionClient, userId: string, input: BankInput, ip?: string) {
    const before = await tx.bankAccount.findUnique({ where: { userId } });
    if (
      before &&
      before.bank === input.bank &&
      before.accountNumber === input.accountNumber &&
      before.holderName === input.holderName
    ) {
      return false;
    }
    await tx.bankAccount.upsert({ where: { userId }, create: { userId, ...input }, update: input });
    await this.audit.record(tx, {
      actorId: userId,
      action: 'bank_account.update',
      targetType: 'user',
      targetId: userId,
      // Бүтэн дансны дугаарыг audit-д давхар хадгалахгүй.
      before: before ? { bank: before.bank, account: maskAccount(before.accountNumber), holder: before.holderName } : null,
      after: { bank: input.bank, account: maskAccount(input.accountNumber), holder: input.holderName },
      ip,
    });
    return true;
  }
}

export function maskAccount(account: string): string {
  return account.length <= 4 ? '****' : `${'*'.repeat(Math.min(account.length - 4, 8))}${account.slice(-4)}`;
}

function toView(r: ApplicationRow): TeacherApplicationView {
  return {
    id: r.id,
    status: r.status,
    displayName: r.displayName,
    bio: r.bio,
    expertise: r.expertise,
    sampleUrl: r.sampleUrl,
    agreementVersion: r.agreementAcceptance.document.version,
    agreementAcceptedAt: r.agreementAcceptance.acceptedAt.toISOString(),
    submittedAt: r.submittedAt.toISOString(),
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  };
}

function toBankView(b: BankAccount): BankAccountView {
  return {
    bank: b.bank as BankCode,
    accountNumber: b.accountNumber,
    holderName: b.holderName,
    updatedAt: b.updatedAt.toISOString(),
  };
}
