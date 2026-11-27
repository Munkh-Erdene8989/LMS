import { Injectable } from '@nestjs/common';
import type { Organization } from '@lms/db';
import type { OrgAdminDetail, OrgAdminRow, OrgAdminStatus } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrgErrors } from './organizations.errors';

export interface OrgInput {
  name: string;
  active: boolean;
  contractEndsAt: Date;
  seatLimit: number;
}

type Actor = { id: string; ip?: string };

export function orgStatus(org: Pick<Organization, 'active' | 'contractEndsAt'>, now = new Date()): OrgAdminStatus {
  if (!org.active) return 'INACTIVE';
  return org.contractEndsAt > now ? 'ACTIVE' : 'EXPIRED';
}

const snapshot = (o: Organization) => ({
  name: o.name,
  active: o.active,
  contractEndsAt: o.contractEndsAt.toISOString(),
  seatLimit: o.seatLimit,
});

/** Админ: байгууллагын CRUD (ticket 45). Өөрчлөлт бүр audit log-той, нэг transaction-д. */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<OrgAdminRow[]> {
    const orgs = await this.prisma.organization.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (orgs.length === 0) return [];
    const [members, pending] = await Promise.all([
      this.prisma.organizationMember.groupBy({ by: ['organizationId'], where: { removedAt: null }, _count: { _all: true } }),
      this.prisma.organizationInvitation.groupBy({ by: ['organizationId'], where: { status: 'PENDING' }, _count: { _all: true } }),
    ]);
    const m = new Map(members.map((r) => [r.organizationId, r._count._all]));
    const p = new Map(pending.map((r) => [r.organizationId, r._count._all]));
    return orgs.map((o) => toRow(o, m.get(o.id) ?? 0, p.get(o.id) ?? 0));
  }

  async get(id: string): Promise<OrgAdminDetail> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          where: { removedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { name: true, identifiers: { select: { type: true, value: true } } } } },
        },
        invitations: { where: { status: 'PENDING' }, orderBy: { invitedAt: 'asc' } },
      },
    });
    if (!org) throw OrgErrors.notFound();
    return {
      ...toRow(org, org.members.length, org.invitations.length),
      members: org.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        phone: m.user.identifiers.find((i) => i.type === 'PHONE')?.value ?? null,
        email: m.user.identifiers.find((i) => i.type === 'EMAIL')?.value ?? null,
        joinedAt: m.createdAt.toISOString(),
      })),
      invitations: org.invitations.map((i) => ({
        id: i.id,
        identifierType: i.identifierType,
        value: i.value,
        status: i.status,
        invitedAt: i.invitedAt.toISOString(),
        acceptedAt: i.acceptedAt?.toISOString() ?? null,
      })),
    };
  }

  async create(input: OrgInput, actor: Actor): Promise<OrgAdminRow> {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: input });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'organization.create',
        targetType: 'organization',
        targetId: org.id,
        after: snapshot(org),
        ip: actor.ip,
      });
      return toRow(org, 0, 0);
    });
  }

  async update(id: string, patch: Partial<OrgInput>, actor: Actor): Promise<OrgAdminRow> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({ where: { id } });
      if (!before) throw OrgErrors.notFound();
      const org = await tx.organization.update({ where: { id }, data: patch });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'organization.update',
        targetType: 'organization',
        targetId: id,
        before: snapshot(before),
        after: snapshot(org),
        ip: actor.ip,
      });
      const [members, pending] = await Promise.all([
        tx.organizationMember.count({ where: { organizationId: id, removedAt: null } }),
        tx.organizationInvitation.count({ where: { organizationId: id, status: 'PENDING' } }),
      ]);
      return toRow(org, members, pending);
    });
  }
}

function toRow(o: Organization, memberCount: number, pendingCount: number): OrgAdminRow {
  return {
    id: o.id,
    name: o.name,
    active: o.active,
    contractEndsAt: o.contractEndsAt.toISOString(),
    seatLimit: o.seatLimit,
    memberCount,
    pendingCount,
    status: orgStatus(o),
  };
}
