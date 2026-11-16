import { notFound } from 'next/navigation';
import { LEGAL_SLUGS, type LegalDocType, type LegalDocView } from '@lms/shared';
import { API_URL } from '@/lib/api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { AcceptLegal } from './accept';

export const dynamic = 'force-dynamic';

function typeOf(slug: string): LegalDocType | null {
  return (Object.entries(LEGAL_SLUGS).find(([, s]) => s === slug)?.[0] as LegalDocType | undefined) ?? null;
}

/** Нийтэд харагдах хууль эрх зүйн баримт (одоогийн, эсвэл `?version=N`). */
export default async function LegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { slug } = await params;
  const { version } = await searchParams;
  const type = typeOf(slug);
  if (!type) notFound();

  const path = version && /^\d+$/.test(version) ? `/legal/${slug}/versions/${version}` : `/legal/${slug}`;
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' }).catch(() => null);
  const doc = res?.ok ? ((await res.json()) as LegalDocView) : null;

  return (
    <main className="page">
      <h1 style={{ marginTop: 0 }}>{doc?.title ?? t(`legal.${type}`)}</h1>
      {!doc && <p style={{ color: 'var(--muted)' }}>{t('legal.notPublished')}</p>}
      {doc && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            {t('legal.versionInfo', { version: doc.version, date: formatDate(doc.publishedAt!) })}
          </p>
          <article style={{ whiteSpace: 'pre-wrap' }}>{doc.body}</article>
          {!version && <AcceptLegal slug={slug} type={type} version={doc.version} />}
        </>
      )}
    </main>
  );
}
