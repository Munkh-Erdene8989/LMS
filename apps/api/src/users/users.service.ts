import { Injectable } from '@nestjs/common';
import { Prisma, type IdentifierType } from '@lms/db';
import type { AuthUser } from '@lms/shared';
import { AuthErrors } from '../auth/errors';
import { PrismaService } from '../prisma/prisma.service';

const userWithIdentifiers = { include: { identifiers: { orderBy: { createdAt: 'asc' } } } } as const;
type UserWithIdentifiers = Prisma.UserGetPayload<typeof userWithIdentifiers>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, ...userWithIdentifiers });
    return toAuthUser(user);
  }

  /** Баталгаажсан identifier-ээр хэрэглэгчийг олно, байхгүй бол шинээр бүртгэнэ. */
  async findOrCreateByIdentifier(
    type: IdentifierType,
    value: string,
  ): Promise<{ user: UserWithIdentifiers; isNew: boolean }> {
    const existing = await this.prisma.identifier.findUnique({ where: { value }, select: { userId: true } });
    if (existing) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: existing.userId }, ...userWithIdentifiers });
      return { user, isNew: false };
    }
    try {
      const user = await this.prisma.user.create({
        data: { identifiers: { create: { type, value, verifiedAt: new Date() } } },
        ...userWithIdentifiers,
      });
      return { user, isNew: true };
    } catch (err) {
      // Зэрэг бүртгэл: нөгөө хүсэлт түрүүлж үүсгэсэн бол түүнийг ашиглана.
      if (isUniqueViolation(err)) return this.findOrCreateByIdentifier(type, value);
      throw err;
    }
  }

  async assertCanLink(userId: string, type: IdentifierType, value: string): Promise<void> {
    const owner = await this.prisma.identifier.findUnique({ where: { value }, select: { userId: true } });
    if (owner && owner.userId !== userId) throw AuthErrors.identifierTaken();
    const sameType = await this.prisma.identifier.findFirst({ where: { userId, type }, select: { id: true } });
    if (owner || sameType) throw AuthErrors.alreadyLinked();
  }

  async link(userId: string, type: IdentifierType, value: string): Promise<AuthUser> {
    await this.assertCanLink(userId, type, value);
    try {
      await this.prisma.identifier.create({ data: { userId, type, value, verifiedAt: new Date() } });
    } catch (err) {
      if (isUniqueViolation(err)) throw AuthErrors.identifierTaken();
      throw err;
    }
    return this.get(userId);
  }

  async updateProfile(id: string, data: { name?: string; avatarUrl?: string | null }): Promise<AuthUser> {
    const user = await this.prisma.user.update({ where: { id }, data, ...userWithIdentifiers });
    return toAuthUser(user);
  }
}

export function toAuthUser(user: UserWithIdentifiers): AuthUser {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    identifiers: user.identifiers.map((i) => ({
      type: i.type,
      value: i.value,
      verifiedAt: i.verifiedAt.toISOString(),
    })),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
