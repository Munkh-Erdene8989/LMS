import { Prisma } from '@lms/db';
import type { CatalogSort, CourseLevel } from '@lms/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { RATING_LATERAL } from './ratings';

/**
 * Нийтийн каталогийн хайлт/шүүлтүүр (нэг raw SQL — pg_trgm-ийг Prisma загварчилдаггүй).
 *
 * - pg_trgm нь `extensions` schema-д (migration 20261117600000_catalog_search). Апп `?schema=`-аар
 *   search_path-ийг нэг schema болгодог тул функц, операторыг үргэлж `extensions.`-ээр бүрэн нэрлэнэ.
 * - Хэрэглэгчийн оролт зөвхөн `Prisma.sql` параметрээр орно; `Prisma.raw` зөвхөн доорх whitelist ORDER BY-д.
 * - Алдаа тэсвэр: `word_similarity` (query-ийн trigram-ууд текстийн аль нэг хэсэгтэй хэр давхцах) ≥ WORD_THRESHOLD
 *   — "прогрмчлал" → "Програмчлалын үндэс" ≈ 0.57. Богино query-д (trigram цөөн) `ILIKE` substring нэмэлтээр.
 */

/** pg_trgm.word_similarity_threshold (анхдагч 0.6 нь нэг үсэг дутуу кирилл үгийг алгасдаг). */
const WORD_THRESHOLD = 0.45;

export interface CatalogFilter {
  q?: string;
  /** Ангиллын id-ууд (үндсэн ангилал + түүний дэд ангиллууд) */
  categoryIds?: string[];
  level?: CourseLevel;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  freePreview?: boolean;
  teacherId?: string;
  sort: CatalogSort;
  limit: number;
  offset: number;
}

export interface CatalogHits {
  ids: string[];
  total: number;
}

/** Нийтэд харагдах lesson: шалгагдсан, архивлаагүй. Каталогийн бүх query энэ нөхцлийг ашиглана. */
export const PUBLIC_LESSON_SQL = Prisma.sql`l.review_status = 'APPROVED' AND l.archived_at IS NULL`;

const ORDER: Record<Exclude<CatalogSort, 'relevance'>, Prisma.Sql> = {
  newest: Prisma.raw('c.published_at DESC NULLS LAST, c.id'),
  price_asc: Prisma.raw('c.price_credits ASC, c.published_at DESC NULLS LAST, c.id'),
  price_desc: Prisma.raw('c.price_credits DESC, c.published_at DESC NULLS LAST, c.id'),
  rating: Prisma.raw('rating.avg DESC NULLS LAST, rating.cnt DESC, c.published_at DESC NULLS LAST, c.id'),
};

export async function searchCatalog(prisma: PrismaService, f: CatalogFilter): Promise<CatalogHits> {
  const q = f.q?.trim().replace(/\s+/g, ' ').slice(0, 100) || null;
  const teacherName = Prisma.sql`COALESCE(ta.display_name, u.name, '')`;

  // PRIVATE (байгууллагын хаалттай) курс каталог, хайлт, багшийн профайлд ХЭЗЭЭ Ч гарахгүй (ticket 44).
  const where: Prisma.Sql[] = [Prisma.sql`c.status = 'PUBLISHED' AND c.visibility = 'PUBLIC'`];
  if (f.categoryIds) {
    if (f.categoryIds.length === 0) return { ids: [], total: 0 };
    where.push(Prisma.sql`c.category_id IN (${Prisma.join(f.categoryIds.map((id) => Prisma.sql`${id}::uuid`))})`);
  }
  if (f.teacherId) where.push(Prisma.sql`c.teacher_id = ${f.teacherId}::uuid`);
  if (f.level) where.push(Prisma.sql`c.level::text = ${f.level}`);
  if (f.minPrice !== undefined) where.push(Prisma.sql`c.price_credits >= ${f.minPrice}`);
  if (f.maxPrice !== undefined) where.push(Prisma.sql`c.price_credits <= ${f.maxPrice}`);
  if (f.minRating !== undefined) where.push(Prisma.sql`rating.avg >= ${f.minRating}`);
  if (f.freePreview) {
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.is_free_preview AND ${PUBLIC_LESSON_SQL})`);
  }

  let score = Prisma.sql`0::float8`;
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    // Зөвхөн `c.search_text` (title + description + багшийн нэр, DB trigger-ээр синк) — нэг GIN trigram index.
    where.push(Prisma.sql`(${q} OPERATOR(extensions.<%) c.search_text OR c.search_text ILIKE ${like})`);
    // Гарчигт таарвал илүү чухал, тайлбарт хамгийн бага.
    score = Prisma.sql`GREATEST(
      extensions.word_similarity(${q}, c.title) + CASE WHEN c.title ILIKE ${like} THEN 0.5 ELSE 0 END,
      extensions.word_similarity(${q}, ${teacherName}) * 0.9,
      extensions.word_similarity(${q}, c.description) * 0.6
    )`;
  }

  const sort = f.sort === 'relevance' && !q ? 'newest' : f.sort;
  const orderBy = sort === 'relevance' ? Prisma.sql`score DESC, ${ORDER.newest}` : ORDER[sort];

  const query = Prisma.sql`
    SELECT c.id, ${score} AS score, count(*) OVER () AS total
    FROM courses c
    JOIN users u ON u.id = c.teacher_id
    LEFT JOIN teacher_applications ta ON ta.user_id = c.teacher_id AND ta.status = 'APPROVED'
    ${RATING_LATERAL}
    WHERE ${Prisma.join(where, ' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${f.limit} OFFSET ${f.offset}`;

  type Row = { id: string; score: number; total: bigint };
  let rows: Row[];
  if (q) {
    // set_config(..., true) нь зөвхөн энэ transaction-д (pgbouncer transaction горимд ч аюулгүй).
    [, rows] = await prisma.$transaction([
      prisma.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(WORD_THRESHOLD)}, true)`,
      prisma.$queryRaw<Row[]>(query),
    ]);
  } else {
    rows = await prisma.$queryRaw<Row[]>(query);
  }

  if (rows.length === 0 && f.offset > 0) {
    // Хуудас хэтэрсэн — нийт тоог мэдэхийн тулд
    const all = await searchCatalog(prisma, { ...f, limit: 1, offset: 0 });
    return { ids: [], total: all.total };
  }
  return { ids: rows.map((r) => r.id), total: rows.length ? Number(rows[0]!.total) : 0 };
}
