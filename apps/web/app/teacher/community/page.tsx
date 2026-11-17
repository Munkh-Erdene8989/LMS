'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COMMUNITY_REMOVE_REASON_MAX, type AuthUser, type CommunityMember, type CommunityMemberPage } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

/** Багш: community-ийн гишүүд (худалдан авсан суралцагчид), хасах / сэргээх. */
export default function TeacherCommunityPage() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, profile] = await Promise.all([
        api<CommunityMemberPage>(`/teacher/community/members?page=${page}`),
        api<AuthUser>('/me'),
      ]);
      setMembers(m.data.items);
      setTotal(m.data.total);
      setPageSize(m.data.pageSize);
      setMe(profile.data.id);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/teacher/community');
      else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    }
  }, [router, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(member: CommunityMember, action: 'remove' | 'restore') {
    let body: { reason?: string } | undefined;
    if (action === 'remove') {
      const reason = window.prompt(t('community.removeReasonPrompt'));
      if (reason === null) return;
      body = reason.trim() ? { reason: reason.trim().slice(0, COMMUNITY_REMOVE_REASON_MAX) } : {};
    }
    setBusy(member.id);
    setError(null);
    try {
      await api(`/teacher/community/members/${member.id}/${action}`, { method: 'POST', body });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <Link href="/teacher/courses">{t('assignment.backToCourses')}</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{t('community.membersTitle')}</h1>
        {me && (
          <Link className="btn btn-ghost" href={`/communities/${me}`}>
            {t('community.viewCommunity')}
          </Link>
        )}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {t('community.membersHint')}
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
      {members?.length === 0 && <p className="muted">{t('community.membersEmpty')}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {members?.map((m) => (
          <div key={m.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {m.avatarUrl ? <img className="avatar" src={m.avatarUrl} alt="" /> : <div className="avatar" />}
            <div style={{ display: 'grid', gap: 2, flex: '1 1 200px' }}>
              <strong>{m.name ?? t('community.unnamed')}</strong>
              <small className="muted">{t('community.memberSince', { date: formatDate(m.since) })}</small>
              {m.removed && (
                <small style={{ color: 'var(--err)' }}>
                  {t('community.removedAt', { date: formatDate(m.removed.at) })}
                  {m.removed.reason && ` · ${t('community.removedReason', { reason: m.removed.reason })}`}
                </small>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy === m.id}
              onClick={() => void act(m, m.removed ? 'restore' : 'remove')}
            >
              {m.removed ? t('community.restore') : t('community.remove')}
            </button>
          </div>
        ))}
      </div>
      {total > pageSize && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('community.membersPrev')}
          </button>
          <small className="muted">{t('community.membersPage', { page, total })}</small>
          <button type="button" className="btn btn-ghost btn-small" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
            {t('community.membersNext')}
          </button>
        </div>
      )}
    </main>
  );
}
