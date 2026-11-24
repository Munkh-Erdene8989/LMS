import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND, CATALOG_SORTS, COURSE_LEVELS, type CatalogPage, type CategoryNode } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { catalogHref, fetchCatalog, fetchCategories, parseCatalogParams, type CatalogParams } from '@/lib/catalog';
import { LinkButton } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { CourseGrid, levelLabel } from './catalog-ui';
import styles from './courses.module.css';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function findCategory(tree: CategoryNode[], slug: string | undefined): CategoryNode | null {
  if (!slug) return null;
  for (const c of tree) {
    if (c.slug === slug) return c;
    const child = c.children.find((x) => x.slug === slug);
    if (child) return child;
  }
  return null;
}

/** Сонгосон ангиллын үндсэн (top-level) node: өөрөө эсвэл эцэг нь. */
function findRoot(tree: CategoryNode[], slug: string | undefined): CategoryNode | null {
  if (!slug) return null;
  return tree.find((c) => c.slug === slug || c.children.some((x) => x.slug === slug)) ?? null;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = parseCatalogParams(await searchParams);
  const category = findCategory((await fetchCategories().catch(() => null)) ?? [], params.category);
  const parts = [params.q && `"${params.q}"`, category?.name, t('catalog.title')].filter(Boolean);
  const title = `${parts.join(' · ')} — ${BRAND.name}`;
  return {
    title,
    description: t('catalog.metaDescription'),
    openGraph: { title, description: t('catalog.metaDescription'), type: 'website' },
    // Шүүлтүүрийн хослол бүрийг index-лэхгүй; ангиллын хуудсууд л хангалттай.
    robots: params.q || params.page || params.level || params.minPrice || params.maxPrice ? { index: false } : undefined,
  };
}

/** Каталог: ангилал, шүүлтүүр, хайлт. Бүх төлөв URL-д (GET form + chip холбоос) — JS-гүй ажиллана. */
export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseCatalogParams(await searchParams);
  const [tree, result] = await Promise.all([
    fetchCategories().catch(() => null),
    fetchCatalog(params).catch(() => null),
  ]);
  const categories = tree ?? [];
  const active = findCategory(categories, params.category);
  const root = findRoot(categories, params.category);
  const extraActive = !!(params.minPrice || params.maxPrice || params.minRating || params.freePreview);
  const anyFilter = !!(params.q || params.category || params.level || extraActive);
  const sort = params.sort ?? (params.q ? 'relevance' : 'newest');

  return (
    <div className="page wide">
      <form action="/courses" method="get">
        <div className={styles.head}>
          <h1 className={styles.title}>{active?.name ?? t('catalog.title')}</h1>
          <div className={styles.search} role="search">
            <label className={styles.srOnly} htmlFor="catalog-q">
              {t('courses.searchLabel')}
            </label>
            <input
              id="catalog-q"
              className={`input ${styles.searchInput}`}
              type="search"
              name="q"
              autoComplete="off"
              enterKeyHint="search"
              defaultValue={params.q}
              maxLength={100}
              placeholder={t('catalog.searchPlaceholder')}
            />
            <button type="submit" className="btn">
              {t('catalog.search')}
            </button>
          </div>
        </div>

        {/* Chip-ээр сонгосон төлөв хайлтын form-д дамжина */}
        {params.category && <input type="hidden" name="category" value={params.category} />}
        {params.level && <input type="hidden" name="level" value={params.level} />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}

        <div className={styles.bar}>
          <nav className={styles.chips} aria-label={t('catalog.categories')}>
            <Link
              className={styles.chip}
              href={catalogHref(params, { category: undefined })}
              aria-current={!params.category ? 'page' : undefined}
            >
              {t('catalog.allCategories')}
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                className={styles.chip}
                href={catalogHref(params, { category: c.slug })}
                aria-current={params.category === c.slug ? 'page' : undefined}
              >
                {c.name}
              </Link>
            ))}
          </nav>
          {root && root.children.length > 0 && (
            <nav className={styles.chips} aria-label={t('courses.subcategories')}>
              <Link
                className={styles.chip}
                href={catalogHref(params, { category: root.slug })}
                aria-current={params.category === root.slug ? 'page' : undefined}
              >
                {t('catalog.allCategories')}
              </Link>
              {root.children.map((ch) => (
                <Link
                  key={ch.id}
                  className={styles.chip}
                  href={catalogHref(params, { category: ch.slug })}
                  aria-current={params.category === ch.slug ? 'page' : undefined}
                >
                  {ch.name}
                </Link>
              ))}
            </nav>
          )}
          <div className={styles.chips}>
            <span className={styles.chipGroupLabel} id="level-group">
              {t('courses.levelGroup')}
            </span>
            <div className={styles.chips} role="group" aria-labelledby="level-group">
              {COURSE_LEVELS.map((l) => (
                <Link
                  key={l}
                  className={styles.chip}
                  href={catalogHref(params, { level: params.level === l ? undefined : l })}
                  aria-current={params.level === l ? 'true' : undefined}
                >
                  {levelLabel(l)}
                </Link>
              ))}
            </div>
            <span className={styles.chipDivider} aria-hidden="true" />
            <span className={styles.chipGroupLabel} id="sort-group">
              {t('courses.sortGroup')}
            </span>
            <div className={styles.chips} role="group" aria-labelledby="sort-group">
              {CATALOG_SORTS.filter((s) => s !== 'relevance' || params.q).map((s) => (
                <Link
                  key={s}
                  className={styles.chip}
                  href={catalogHref(params, { sort: s })}
                  aria-current={sort === s ? 'true' : undefined}
                >
                  {t(`catalog.sort${s}` as MessageKey)}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <details className={styles.more} open={extraActive || undefined}>
          <summary>{t('courses.moreFilters')}</summary>
          <div className={styles.moreBody}>
            <label className={styles.field}>
              {t('catalog.rating')}
              <select className="input" name="minRating" defaultValue={params.minRating ?? ''}>
                <option value="">{t('catalog.anyRating')}</option>
                {[4, 3].map((r) => (
                  <option key={r} value={r}>
                    {t('catalog.ratingAtLeast', { rating: r })}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.field}>
              <legend>{t('catalog.price')}</legend>
              <div className={styles.priceRow}>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  name="minPrice"
                  defaultValue={params.minPrice}
                  placeholder="0…"
                  aria-label={t('catalog.minPrice')}
                />
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  name="maxPrice"
                  defaultValue={params.maxPrice}
                  placeholder="500…"
                  aria-label={t('catalog.maxPrice')}
                />
              </div>
            </fieldset>
            <label className={styles.check}>
              <input type="checkbox" name="freePreview" value="1" defaultChecked={!!params.freePreview} />
              {t('catalog.freePreview')}
            </label>
            <div className={styles.moreActions}>
              <button type="submit" className="btn btn-secondary">
                {t('catalog.apply')}
              </button>
            </div>
          </div>
        </details>
      </form>

      <section aria-label={t('catalog.title')}>
        {result ? (
          <Results params={params} result={result} anyFilter={anyFilter} categories={categories} />
        ) : (
          <EmptyState title={t('courses.unavailableTitle')} description={t('courses.unavailableBody')} />
        )}
      </section>
    </div>
  );
}

function Results({
  params,
  result,
  anyFilter,
  categories,
}: {
  params: CatalogParams;
  result: CatalogPage;
  anyFilter: boolean;
  categories: { id: string; slug: string; name: string }[];
}) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <p className={styles.resultsInfo} role="status">
        {params.q ? t('catalog.resultsFor', { q: params.q, count: result.total }) : t('catalog.results', { count: result.total })}
      </p>
      {result.items.length === 0 ? (
        <>
        <EmptyState
          title={t('courses.emptyTitle')}
          description={t('courses.emptyBody')}
          action={
            anyFilter ? (
              <LinkButton variant="secondary" href="/courses">
                {t('courses.clearFilters')}
              </LinkButton>
            ) : undefined
          }
        />
        {categories.length > 0 && (
          <div className={styles.suggest}>
            <span>{t('catalog.suggestCategories')}</span>
            <nav className={styles.chips} aria-label={t('catalog.categories')}>
              {categories.slice(0, 8).map((c) => (
                <Link key={c.id} className={styles.chip} href={catalogHref({}, { category: c.slug })}>
                  {c.name}
                </Link>
              ))}
            </nav>
          </div>
        )}
        </>
      ) : (
        <CourseGrid courses={result.items} />
      )}
      {pages > 1 && (
        <nav className={styles.pager} aria-label={t('catalog.pageOf', { page: result.page, pages })}>
          {result.page > 1 ? (
            <LinkButton variant="secondary" href={catalogHref(params, { page: String(result.page - 1) })} rel="prev">
              {t('catalog.prev')}
            </LinkButton>
          ) : (
            <span />
          )}
          <span className="muted">{t('catalog.pageOf', { page: result.page, pages })}</span>
          {result.page < pages ? (
            <LinkButton variant="secondary" href={catalogHref(params, { page: String(result.page + 1) })} rel="next">
              {t('catalog.next')}
            </LinkButton>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
