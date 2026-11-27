import type { PrismaClient } from '@lms/db';
import { BRAND } from '@lms/shared';
import { normalizeEmail, normalizePhone } from '../auth/identifier';
import type { Db } from '../purchases/entitlements';

/**
 * House teacher — платформын өөрийн (брэнд нэртэй) TEACHER аккаунт; private курсийн заавал эзэн (ticket 44).
 * Түүний user id `settings` хүснэгтэд энэ түлхүүрээр хадгалагдана (`pnpm --filter @lms/api house-teacher:seed`).
 * Утга нь id (тоо биш) тул `SETTINGS` registry-д (бүхэл тоон тохиргоо) орохгүй, админы тохиргооны жагсаалтад харагдахгүй.
 */
export const HOUSE_TEACHER_SETTING_KEY = 'houseTeacherUserId';

export async function getHouseTeacherId(db: Db): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: HOUSE_TEACHER_SETTING_KEY } });
  return typeof row?.value === 'string' ? row.value : null;
}

export async function isHouseTeacher(db: Db, userId: string): Promise<boolean> {
  return (await getHouseTeacherId(db)) === userId;
}

export class HouseTeacherError extends Error {}

/**
 * House teacher-ийг (дахин ажиллуулахад аюулгүй) бэлтгэнэ: байхгүй бол брэнд нэртэй TEACHER хэрэглэгч үүсгэж
 * тохиргоонд бүртгэнэ; байвал TEACHER эрхийг баталгаажуулна. `identifier` (утас/имэйл) өгвөл тэр аккаунтаар
 * нэвтрэх боломжтой болгоно (админ private курс зохиохдоо ашиглана) — өөр хэрэглэгчийнх бол татгалзана.
 */
export async function ensureHouseTeacher(
  prisma: PrismaClient,
  opts: { name?: string; identifier?: string } = {},
): Promise<{ userId: string; created: boolean }> {
  const name = opts.name ?? BRAND.name;
  let identifier: { type: 'PHONE' | 'EMAIL'; value: string } | null = null;
  if (opts.identifier) {
    const isEmail = opts.identifier.includes('@');
    const value = isEmail ? normalizeEmail(opts.identifier) : normalizePhone(opts.identifier);
    if (!value) throw new HouseTeacherError(`Утас эсвэл имэйл буруу: ${opts.identifier}`);
    identifier = { type: isEmail ? 'EMAIL' : 'PHONE', value };
  }

  return prisma.$transaction(async (tx) => {
    const existingId = await getHouseTeacherId(tx);
    let user = existingId ? await tx.user.findUnique({ where: { id: existingId } }) : null;
    let created = false;
    if (!user) {
      user = await tx.user.create({ data: { name, roles: ['TEACHER'] } });
      await tx.setting.upsert({
        where: { key: HOUSE_TEACHER_SETTING_KEY },
        create: { key: HOUSE_TEACHER_SETTING_KEY, value: user.id },
        update: { value: user.id },
      });
      created = true;
    } else if (!user.roles.includes('TEACHER')) {
      user = await tx.user.update({ where: { id: user.id }, data: { roles: { set: [...user.roles, 'TEACHER'] } } });
    }

    if (identifier) {
      const taken = await tx.identifier.findUnique({ where: { value: identifier.value } });
      if (taken && taken.userId !== user.id) {
        throw new HouseTeacherError(`${identifier.value} өөр хэрэглэгчид бүртгэлтэй байна.`);
      }
      if (!taken) {
        await tx.identifier.upsert({
          where: { userId_type: { userId: user.id, type: identifier.type } },
          create: { userId: user.id, type: identifier.type, value: identifier.value, verifiedAt: new Date() },
          update: { value: identifier.value, verifiedAt: new Date() },
        });
      }
    }
    return { userId: user.id, created };
  });
}
