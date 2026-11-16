import type { PrismaClient, Role } from '@lms/db';
import { normalizeEmail, normalizePhone } from '../auth/identifier';

export class GrantRoleError extends Error {}

/**
 * Identifier (утас/имэйл)-аар хэрэглэгч олж role олгоно, audit-д "систем" үйлдэл болгон бичнэ.
 * Эхний админыг CLI-ээр үүсгэхэд ашиглана (`pnpm --filter @lms/api admin:grant <утас|имэйл>`).
 */
export async function grantRoleByIdentifier(
  prisma: PrismaClient,
  identifier: string,
  role: Role,
): Promise<{ userId: string; roles: Role[]; changed: boolean }> {
  const value = identifier.includes('@') ? normalizeEmail(identifier) : normalizePhone(identifier);
  if (!value) throw new GrantRoleError(`Утас эсвэл имэйл буруу: ${identifier}`);

  return prisma.$transaction(async (tx) => {
    const found = await tx.identifier.findUnique({ where: { value }, include: { user: true } });
    if (!found) {
      throw new GrantRoleError(`${value} бүртгэлгүй байна. Эхлээд тэр утас/имэйлээр нэг удаа нэвтэрнэ үү.`);
    }
    const before = found.user.roles;
    if (before.includes(role)) return { userId: found.userId, roles: before, changed: false };

    const updated = await tx.user.update({
      where: { id: found.userId },
      data: { roles: { set: [...before, role] } },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'user.role.grant',
        targetType: 'user',
        targetId: found.userId,
        before: { roles: before },
        after: { roles: updated.roles },
      },
    });
    return { userId: found.userId, roles: updated.roles, changed: true };
  });
}
