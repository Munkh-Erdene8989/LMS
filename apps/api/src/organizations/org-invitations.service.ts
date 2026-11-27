import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { IdentifierType, Prisma } from '@lms/db';
import type { OrgInviteOutcome, OrgInviteResult, OrgInviteRowResult } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { EMAIL_SENDER, type EmailSender } from '../adapters/email';
import { normalizeEmail, normalizePhone } from '../auth/identifier';
import { ENV, type Env } from '../env';
import { NotificationsService } from '../notifications/notifications.service';
import { renderEmail, renderNotification } from '../notifications/render';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { OrgErrors } from './organizations.errors';

export const ORG_INVITATION_EMAIL_JOB = 'organization.invitation.email';
export const ORG_INVITE_MAX_ROWS = 200;

type Tx = Prisma.TransactionClient;

/** Мөр: имэйл (`@` агуулсан) эсвэл Монгол утас. Буруу бол null. */
export function parseInviteEntry(raw: string): { type: IdentifierType; value: string } | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('@')) {
    const value = normalizeEmail(s);
    return value ? { type: 'EMAIL', value } : null;
  }
  const value = normalizePhone(s);
  return value ? { type: 'PHONE', value } : null;
}

/** Paste хийсэн текстийг мөр/таслал/цэгтэй таслалаар салгана. */
export function splitInviteText(text: string): string[] {
  return text
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Байгууллагын урилга (ticket 45): урих, цуцлах, OTP нэвтрэлт/identifier холбоход pending -> гишүүнчлэл.
 * Суудал = идэвхтэй гишүүд + PENDING урилга <= `seat_limit`; шалгалт нь байгууллагын мөрийг `FOR UPDATE`-ээр
 * түгжсэн transaction-д тул зэрэг урилга суудлыг хэтрүүлэхгүй. Эрхийн дүрэм `org-access.ts`-д хэвээр.
 */
@Injectable()
export class OrgInvitationsService implements OnModuleInit {
  private readonly log = new Logger(OrgInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register<{ invitationId: string }>(
      ORG_INVITATION_EMAIL_JOB,
      (data) => this.sendInvitationEmail(data.invitationId),
      { attempts: 5, backoffMs: 30_000 },
    );
  }

  async invite(orgId: string, entries: string[], actor: { id: string; ip?: string }): Promise<OrgInviteResult> {
    if (entries.length === 0) throw OrgErrors.noEntries();
    if (entries.length > ORG_INVITE_MAX_ROWS) throw OrgErrors.tooManyEntries(ORG_INVITE_MAX_ROWS);

    const emailJobs: string[] = [];
    const joined: { userId: string; orgName: string }[] = [];

    const results = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ name: string; seat_limit: number }[]>`
          SELECT name, seat_limit FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw OrgErrors.notFound();
        const { name: orgName, seat_limit: seatLimit } = locked[0]!;

        let used =
          (await tx.organizationMember.count({ where: { organizationId: orgId, removedAt: null } })) +
          (await tx.organizationInvitation.count({ where: { organizationId: orgId, status: 'PENDING' } }));

        const out: OrgInviteRowResult[] = [];
        for (const input of entries) {
          const parsed = parseInviteEntry(input);
          const row = (outcome: OrgInviteOutcome): OrgInviteRowResult => ({ input, value: parsed?.value ?? null, outcome });
          if (!parsed) {
            out.push(row('INVALID'));
            continue;
          }

          const existing = await tx.identifier.findUnique({ where: { value: parsed.value }, select: { userId: true } });
          if (existing) {
            const member = await this.activeMember(tx, orgId, existing.userId);
            if (member) {
              out.push(row('ALREADY_MEMBER'));
              continue;
            }
          }
          const pending = await tx.organizationInvitation.findFirst({
            where: { organizationId: orgId, value: parsed.value, status: 'PENDING' },
            select: { id: true },
          });
          if (pending) {
            out.push(row('ALREADY_INVITED'));
            continue;
          }
          if (used >= seatLimit) {
            out.push(row('NO_SEATS'));
            continue;
          }

          used += 1;
          if (existing) {
            await tx.organizationMember.create({ data: { organizationId: orgId, userId: existing.userId } });
            await this.audit.record(tx, {
              actorId: actor.id,
              action: 'organization.member.add',
              targetType: 'organization',
              targetId: orgId,
              after: { userId: existing.userId, via: parsed.value },
              ip: actor.ip,
            });
            joined.push({ userId: existing.userId, orgName });
            out.push(row('ADDED'));
          } else {
            const inv = await tx.organizationInvitation.create({
              data: { organizationId: orgId, identifierType: parsed.type, value: parsed.value },
            });
            await this.audit.record(tx, {
              actorId: actor.id,
              action: 'organization.invitation.create',
              targetType: 'organization',
              targetId: orgId,
              after: { invitationId: inv.id, value: parsed.value },
              ip: actor.ip,
            });
            // Имэйл урилга л мэдэгдэл авна; утсанд SMS явуулахгүй (SMS зөвхөн OTP).
            if (parsed.type === 'EMAIL') emailJobs.push(inv.id);
            out.push(row('INVITED'));
          }
        }
        return out;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    for (const j of joined) await this.notifyJoined(j.userId, j.orgName);
    for (const id of emailJobs) {
      await this.queue.add(ORG_INVITATION_EMAIL_JOB, { invitationId: id }, { jobId: `org-invitation-email-${id}` });
    }
    return { results };
  }

  async cancelInvitation(orgId: string, invitationId: string, actor: { id: string; ip?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitationId, organizationId: orgId, status: 'PENDING' },
        data: { status: 'CANCELED' },
      });
      if (count === 0) throw OrgErrors.invitationNotFound();
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'organization.invitation.cancel',
        targetType: 'organization',
        targetId: orgId,
        after: { invitationId },
        ip: actor.ip,
      });
    });
  }

  async removeMember(orgId: string, memberId: string, actor: { id: string; ip?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.organizationMember.updateMany({
        where: { id: memberId, organizationId: orgId, removedAt: null },
        data: { removedAt: new Date() },
      });
      if (count === 0) throw OrgErrors.memberNotFound();
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'organization.member.remove',
        targetType: 'organization',
        targetId: orgId,
        after: { memberId },
        ip: actor.ip,
      });
    });
  }

  /**
   * Auth hook: identifier-ээр OTP нэвтрэх эсвэл identifier холбож баталгаажуулсны дараа тухайн утгын PENDING
   * урилгуудыг гишүүнчлэл болгоно. Нэг transaction; урилга бүрийг `status = PENDING` нөхцөлтэй шинэчилдэг тул
   * дахин/зэрэг дуудахад давхар гишүүнчлэл үүсэхгүй. Хасагдсан гишүүн байсан бол шинэ идэвхтэй мөр үүснэ.
   * Суудал урилга үүсэхэд аль хэдийн эзлэгдсэн тул энд дахин шалгахгүй.
   */
  async acceptForIdentifier(userId: string, value: string): Promise<number> {
    const joined = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.organizationInvitation.findMany({
        where: { value, status: 'PENDING' },
        include: { organization: { select: { name: true } } },
        orderBy: { invitedAt: 'asc' },
      });
      const done: string[] = [];
      for (const inv of pending) {
        const { count } = await tx.organizationInvitation.updateMany({
          where: { id: inv.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        if (count === 0) continue;
        const active = await this.activeMember(tx, inv.organizationId, userId);
        if (!active) {
          await tx.organizationMember.create({ data: { organizationId: inv.organizationId, userId } });
          done.push(inv.organization.name);
        }
      }
      return done;
    });
    for (const orgName of joined) await this.notifyJoined(userId, orgName);
    return joined.length;
  }

  /** Нэвтрэлтийг хэзээ ч бүтэлгүйтүүлэхгүй; pending урилга дараагийн нэвтрэлтэд дахин оролдогдоно. */
  async acceptForIdentifierSafe(userId: string, value: string): Promise<void> {
    try {
      await this.acceptForIdentifier(userId, value);
    } catch (err) {
      this.log.error(`Байгууллагын урилга хүлээн авахад алдаа (${userId}): ${(err as Error).message}`);
    }
  }

  private activeMember(tx: Tx, organizationId: string, userId: string) {
    return tx.organizationMember.findFirst({ where: { organizationId, userId, removedAt: null }, select: { id: true } });
  }

  private async notifyJoined(userId: string, orgName: string): Promise<void> {
    try {
      await this.notifications.notify({ userId, type: 'ORG_JOINED', params: { org: orgName }, link: '/me' });
    } catch (err) {
      this.log.error(`ORG_JOINED мэдэгдэл алдаатай (${userId}): ${(err as Error).message}`);
    }
  }

  /** Дарааллын ажил: бүртгэлгүй имэйлд нэвтрэх линктэй урилга. Алдаа шидвэл дараалал дахин оролдоно. */
  private async sendInvitationEmail(invitationId: string): Promise<void> {
    const inv = await this.prisma.organizationInvitation.findUnique({
      where: { id: invitationId },
      include: { organization: { select: { name: true } } },
    });
    if (!inv || inv.status !== 'PENDING' || inv.identifierType !== 'EMAIL') return;
    const link = new URL('/login', this.env.PUBLIC_WEB_URL).toString();
    const message = renderEmail(renderNotification('ORG_INVITATION', { org: inv.organization.name }), link);
    await this.email.send({ to: inv.value, ...message });
  }
}
