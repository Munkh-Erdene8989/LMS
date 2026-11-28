import type { Prisma } from '@lms/db';
import type { Db } from '../purchases/entitlements';

/**
 * Байгууллагын эрх (ticket 44) — "хэрэглэгч идэвхтэй байгууллагын гишүүн ба курс тэр байгууллагад олгогдсон"
 * гэсэн дүрмийн ЦОРЫН ГАНЦ эх сурвалж. Lesson нээх бүх шалгалт (Mux token, PDF URL, live линк, quiz, явц)
 * `LessonAccessPolicy`-ээр дамжиж энд ирнэ; "Миний сургалт", тайлан (ticket 47, 48) ч энд дуудна.
 *
 * - Байгууллага идэвхтэй = `active` ∧ `contract_ends_at > now`.
 * - Гишүүн идэвхтэй = `removed_at IS NULL`.
 * - Эрх `Entitlement` мөр үүсгэхгүй (purchase байхгүй) — үргэлж динамикаар тооцогдох тул хасах/дуусах/идэвхгүй
 *   болгоход тэр дороо хаагдаж, сэргээхэд явц, quiz, сертификат хэвээр үргэлжилнэ.
 */
export function activeOrganizationWhere(now: Date): Prisma.OrganizationWhereInput {
  return { active: true, contractEndsAt: { gt: now } };
}

/** Хэрэглэгч тухайн курсийг байгууллагын эрхээр үзэж болох эсэх. */
export async function hasOrgCourseAccess(db: Db, userId: string, courseId: string, now = new Date()): Promise<boolean> {
  const row = await db.organizationMember.findFirst({
    where: {
      userId,
      removedAt: null,
      organization: { ...activeOrganizationWhere(now), courseGrants: { some: { courseId } } },
    },
    select: { id: true },
  });
  return row !== null;
}

export interface OrgCourseGrant {
  courseId: string;
  /** Эрхийг өгч буй байгууллага(ууд) — нэг курс олон байгууллагаас олгогдож болно */
  organizations: { id: string; name: string }[];
}

/**
 * Хэрэглэгч байгууллагын эрхээр үзэж болох бүх курс (идэвхтэй байгууллага × идэвхтэй гишүүнчлэл × grant).
 * `courseId` өгвөл зөвхөн тэр курс.
 */
export async function orgCourseGrants(db: Db, userId: string, courseId?: string, now = new Date()): Promise<Map<string, OrgCourseGrant>> {
  const grants = await db.organizationCourseGrant.findMany({
    where: {
      courseId,
      organization: { ...activeOrganizationWhere(now), members: { some: { userId, removedAt: null } } },
    },
    select: { courseId: true, organization: { select: { id: true, name: true } } },
  });
  const map = new Map<string, OrgCourseGrant>();
  for (const g of grants) {
    const e = map.get(g.courseId) ?? { courseId: g.courseId, organizations: [] };
    e.organizations.push(g.organization);
    map.set(g.courseId, e);
  }
  return map;
}

/** Курсийг байгууллагын эрхээр одоо үзэж болох бүх хэрэглэгч (live сануулга г.м). */
export async function orgMemberIdsWithAccess(db: Db, courseId: string, now = new Date()): Promise<string[]> {
  const rows = await db.organizationMember.findMany({
    where: { removedAt: null, organization: { ...activeOrganizationWhere(now), courseGrants: { some: { courseId } } } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}
