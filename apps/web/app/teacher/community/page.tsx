'use client';

import { useCallback, useEffect, useState } from 'react';
import { COMMUNITY_REMOVE_REASON_MAX, type AuthUser, type CommunityMember, type CommunityMemberPage } from '@lms/shared';
import { api, errorText, useApiFailure } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button, LinkButton } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import { PromptDialog } from '../prompt-dialog';
import s from '../teacher.module.css';

/** Багш: community-ийн гишүүд (худалдан авсан суралцагчид), хасах / сэргээх. */
export default function TeacherCommunityPage() {
  const fail = useApiFailure();
  const [me, setMe] = useState<string | null>(null);
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CommunityMember | null>(null);

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
      const msg = fail(err);
      if (msg) setError(msg);
    }
  }, [fail, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(member: CommunityMember, action: 'remove' | 'restore', reason?: string) {
    const body = action === 'remove' ? (reason ? { reason: reason.slice(0, COMMUNITY_REMOVE_REASON_MAX) } : {}) : undefined;
    setBusy(member.id);
    setError(null);
    try {
      await api(`/teacher/community/members/${member.id}/${action}`, { method: 'POST', body });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.title}>{t('community.membersTitle')}</h1>
        {me && (
          <LinkButton variant="secondary" href={`/communities/${me}`}>
            {t('community.viewCommunity')}
          </LinkButton>
        )}
      </div>
      <p className={s.lead}>{t('community.membersHint')}</p>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {!members && !error && (
        <div className={s.stack} aria-busy="true" aria-label={t('ui.loading')}>
          <Skeleton height={72} radius={22} />
          <Skeleton height={72} radius={22} />
        </div>
      )}
      {members?.length === 0 && (
        <div className="card">
          <EmptyState title={t('community.membersEmpty')} />
        </div>
      )}
      <div className={s.stack}>
        {members?.map((m) => (
          <div key={m.id} className={`card ${s.member}`}>
            {m.avatarUrl ? <img className="avatar" src={m.avatarUrl} alt="" width={40} height={40} loading="lazy" /> : <div className="avatar" />}
            <div className={s.memberInfo}>
              <strong>{m.name ?? t('community.unnamed')}</strong>
              <small className="muted">{t('community.memberSince', { date: formatDate(m.since) })}</small>
              {m.removed && (
                <small className={s.error}>
                  {t('community.removedAt', { date: formatDate(m.removed.at) })}
                  {m.removed.reason && ` · ${t('community.removedReason', { reason: m.removed.reason })}`}
                </small>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === m.id}
              loadingLabel={m.removed ? t('community.restore') : t('community.remove')}
              onClick={() => (m.removed ? void act(m, 'restore') : setRemoving(m))}
            >
              {m.removed ? t('community.restore') : t('community.remove')}
            </Button>
          </div>
        ))}
      </div>
      {total > pageSize && (
        <div className={s.row}>
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('community.membersPrev')}
          </Button>
          <small className="muted">{t('community.membersPage', { page, total })}</small>
          <Button variant="secondary" size="sm" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
            {t('community.membersNext')}
          </Button>
        </div>
      )}
      <PromptDialog
        open={removing !== null}
        title={t('teacherUi.removeMemberTitle')}
        label={t('community.removeReasonPrompt')}
        maxLength={COMMUNITY_REMOVE_REASON_MAX}
        confirmLabel={t('community.remove')}
        danger
        onClose={() => setRemoving(null)}
        onSubmit={(reason) => {
          const m = removing;
          setRemoving(null);
          if (m) void act(m, 'remove', reason);
        }}
      />
    </div>
  );
}
