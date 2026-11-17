import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND, CATALOG_SORTS, COURSE_LEVELS, type CatalogPage, type CategoryNode } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { catalogHref, fetchCatalog, fetchCategories, parseCatalogParams, type CatalogParams } from '@/lib/catalog';
import { CourseGrid, levelLabel } from './catalog-ui';

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

/** Каталог: ангилал, шүүлтүүр, хайлт. Бүх төлөв URL-д (GET form) — JS-гүй ажиллана. */
export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseCatalogParams(await searchParams);
  const [tree, result] = await Promise.all([
    fetchCategories().catch(() => null),
    fetchCatalog(params).catch(() => null),
  ]);
  const categories = tree ?? [];
  const active = findCategory(categories, params.category);
  const filtersActive = !!(params.level || params.minPrice || params.maxPrice || params.minRating || params.freePreview);

  return (
    <main className="page wide">
      <form action="/courses" method="get" className="catalog-layout">
        <div className="catalog-head">
          <h1 style={{ margin: 0 }}>{active?.name ?? t('catalog.title')}</h1>
          <div className="catalog-search" role="search">
            <input
              className="input"
              type="search"
              name="q"
              defaultValue={params.q}
              maxLength={100}
              placeholder={t('catalog.searchPlaceholder')}
              aria-label={t('catalog.searchPlaceholder')}
            />
            <button className="btn">{t('catalog.search')}</button>
          </div>
          {params.category && <input type="hidden" name="category" value={params.category} />}
        </div>

        <aside className="catalog-side">
          <nav aria-label={t('catalog.categories')}>
            <h2 className="side-title">{t('catalog.categories')}</h2>
            <ul className="category-tree">
              <li>
                <Link href={catalogHref(params, { category: undefined })} aria-current={!params.category ? 'page' : undefined}>
                  {t('catalog.allCategories')}
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={catalogHref(params, { category: c.slug })} aria-current={params.category === c.slug ? 'page' : undefined}>
                    {c.name}
                  </Link>
                  {c.children.length > 0 && (
                    <ul>
                      {c.children.map((ch) => (
                        <li key={ch.id}>
                          <Link
                            href={catalogHref(params, { category: ch.slug })}
                            aria-current={params.category === ch.slug ? 'page' : undefined}
                          >
                            {ch.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <details className="catalog-filters" open={filtersActive || undefined}>
            <summary className="side-title">{t('catalog.filters')}</summary>
            <label>
              {t('catalog.level')}
              <select className="input" name="level" defaultValue={params.level ?? ''}>
                <option value="">{t('catalog.anyLevel')}</option>
                {COURSE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {levelLabel(l)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>{t('catalog.price')}</legend>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="number" min={0} name="minPrice" defaultValue={params.minPrice} placeholder={t('catalog.minPrice')} aria-label={t('catalog.minPrice')} />
                <input className="input" type="number" min={0} name="maxPrice" defaultValue={params.maxPrice} placeholder={t('catalog.maxPrice')} aria-label={t('catalog.maxPrice')} />
              </div>
            </fieldset>
            <label>
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
            <label className="checkbox">
              <input type="checkbox" name="freePreview" value="1" defaultChecked={!!params.freePreview} />
              {t('catalog.freePreview')}
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn">{t('catalog.apply')}</button>
              <Link className="btn btn-ghost" href={catalogHref({ category: params.category })}>
                {t('catalog.clear')}
              </Link>
            </div>
          </details>
        </aside>

        <section className="catalog-results">
          {result ? <Results params={params} result={result} /> : <p className="muted">{t('catalog.unavailable')}</p>}
        </section>
      </form>
    </main>
  );
}

function Results({ params, result }: { params: CatalogParams; result: CatalogPage }) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const sort = params.sort ?? (params.q ? 'relevance' : 'newest');
  return (
    <>
      <div className="results-bar">
        <span className="muted">
          {params.q ? t('catalog.resultsFor', { q: params.q, count: result.total }) : t('catalog.results', { count: result.total })}
        </span>
        <label className="sort">
          {t('catalog.sort')}
          <select className="input" name="sort" defaultValue={sort}>
            {CATALOG_SORTS.filter((s) => s !== 'relevance' || params.q).map((s) => (
              <option key={s} value={s}>
                {t(`catalog.sort${s}` as MessageKey)}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost">{t('catalog.apply')}</button>
        </label>
      </div>
      {result.items.length === 0 ? <p className="muted">{t('catalog.empty')}</p> : <CourseGrid courses={result.items} />}
      {pages > 1 && (
        <nav className="pager" aria-label={t('catalog.pageOf', { page: result.page, pages })}>
          {result.page > 1 ? (
            <Link className="btn btn-ghost" href={catalogHref(params, { page: String(result.page - 1) })} rel="prev">
              {t('catalog.prev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">{t('catalog.pageOf', { page: result.page, pages })}</span>
          {result.page < pages ? (
            <Link className="btn btn-ghost" href={catalogHref(params, { page: String(result.page + 1) })} rel="next">
              {t('catalog.next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
