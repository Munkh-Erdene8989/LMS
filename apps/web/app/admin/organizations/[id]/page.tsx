'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { OrgAdminDetail, OrgInviteResult } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../../ui/button';
import { useConfirm } from '../../../ui/confirm';
import { EmptyState } from '../../../ui/empty-state';
import { ErrorLine, FilterTabs, LoadingRows, Pill, errorText } from '../../admin-ui';
import styles from '../../admin.module.css';
import { OrgForm, draftBody, draftFromRow } from '../org-form';
import { ORG_STATUS_TONE } from '../org-status';
import { OrgCoursesTab } from './org-courses-tab';

/** Хэсгүүд: `courses` (ticket 46); `report` (ticket 48) энд залгагдана. */
type Tab = 'members' | 'courses' | 'report';

export default function AdminOrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [org, setOrg] = useState<OrgAdminDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('members');

  const load = useCallback(async () => {
    try {
      setOrg((await api<OrgAdminDetail>(`/admin/organizations/${id}`)).data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !org) return <ErrorLine>{error}</ErrorLine>;
  if (!org) return <LoadingRows />;

  return (
    <div className={styles.stackLg}>
      <Link href="/admin/organizations" className={`${styles.back} ${styles.anchor}`}>
        {t('orgAdmin.back')}
      </Link>
      <section className={styles.stack}>
        <h1 className={styles.title}>{org.name}</h1>
        <p className={styles.toolbar}>
          <Pill tone={ORG_STATUS_TONE[org.status]}>{t(`orgAdmin.status${org.status}` as MessageKey)}</Pill>
          <span className={styles.muted}>
            {t('orgAdmin.colSeats')}:{' '}
            {t('orgAdmin.seatsUsed', { used: formatNumber(org.memberCount + org.pendingCount), limit: formatNumber(org.seatLimit) })}
          </span>
          <span className={styles.muted}>
            {t('orgAdmin.colContract')}: {formatDate(org.contractEndsAt)}
          </span>
        </p>
      </section>

      <section className={styles.stack} aria-labelledby="org-settings">
        <h2 id="org-settings" className={styles.subtitle}>
          {t('orgAdmin.settings')}
        </h2>
        <OrgForm
          key={`${org.name}|${org.active}|${org.contractEndsAt}|${org.seatLimit}`}
          initial={draftFromRow(org)}
          submitLabel={t('orgAdmin.save')}
          confirmDeactivate={() =>
            confirm({ title: t('orgAdmin.deactivateTitle'), body: t('orgAdmin.deactivateBody'), confirmLabel: t('orgAdmin.deactivateConfirm'), danger: true })
          }
          onSubmit={async (d) => {
            await api(`/admin/organizations/${id}`, { method: 'PATCH', body: draftBody(d) });
            await load();
          }}
        />
      </section>

      <FilterTabs
        label={t('orgAdmin.tabsLabel')}
        value={tab}
        onChange={setTab}
        items={[
          { key: 'members', label: t('orgAdmin.tabMembers') },
          { key: 'courses', label: t('orgAdmin.tabCourses') },
          { key: 'report', label: t('orgAdmin.tabReport') },
        ]}
      />

      {tab === 'members' && <MembersTab org={org} reload={load} />}
      {tab === 'courses' && <OrgCoursesTab organizationId={id} />}
      {tab === 'report' && <EmptyState title={t('orgAdmin.tabSoon')} />}
    </div>
  );
}

function MembersTab({ org, reload }: { org: OrgAdminDetail; reload: () => Promise<void> }) {
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OrgInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    await run(async () => {
      const r = await api<OrgInviteResult>(`/admin/organizations/${org.id}/invitations`, { method: 'POST', body: { text } });
      setResult(r.data);
      setText('');
    });
    setBusy(false);
  }

  return (
    <div className={styles.stackLg}>
      {error && <ErrorLine>{error}</ErrorLine>}

      <section className={styles.item} aria-labelledby="org-invite">
        <h2 id="org-invite" className={styles.subtitle}>
          {t('orgAdmin.inviteTitle')}
        </h2>
        <form onSubmit={invite} className={styles.stack}>
          <p className={styles.hint}>{t('orgAdmin.inviteHint')}</p>
          <textarea
            className={`input ${styles.textarea}`}
            required
            rows={6}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('orgAdmin.inviteTitle')}
            placeholder={t('orgAdmin.invitePlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div>
            <Button type="submit" loading={busy}>
              {t('orgAdmin.inviteSubmit')}
            </Button>
          </div>
        </form>
        {result && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{t('orgAdmin.inviteResults')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('orgAdmin.colInput')}</th>
                  <th scope="col">{t('orgAdmin.colResult')}</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td className={styles.wrap}>{r.input}</td>
                    <td>
                      <Pill tone={r.outcome === 'INVITED' || r.outcome === 'ADDED' ? 'ok' : r.outcome === 'ALREADY_MEMBER' || r.outcome === 'ALREADY_INVITED' ? 'neutral' : 'err'}>
                        {t(`orgAdmin.outcome${r.outcome}` as MessageKey)}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.stack} aria-labelledby="org-members">
        <h2 id="org-members" className={styles.subtitle}>
          {t('orgAdmin.membersTitle', { count: formatNumber(org.members.length) })}
        </h2>
        {org.members.length === 0 ? (
          <EmptyState title={t('orgAdmin.noMembers')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{t('orgAdmin.tabMembers')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('orgAdmin.colPerson')}</th>
                  <th scope="col">{t('orgAdmin.colJoined')}</th>
                  <th scope="col">{t('orgAdmin.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {org.members.map((m) => {
                  const who = [m.phone, m.email].filter(Boolean).join(' · ');
                  return (
                    <tr key={m.id}>
                      <th scope="row" className={styles.wrap}>
                        <Link className={styles.anchor} href={`/admin/users/${m.userId}`}>
                          {m.name ?? who}
                        </Link>
                        {m.name && <small className={styles.muted}> {who}</small>}
                      </th>
                      <td className={styles.nowrap}>{formatDate(m.joinedAt)}</td>
                      <td className={styles.actions}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('orgAdmin.removeTitle'),
                              body: `${t('orgAdmin.removeBody')} (${m.name ?? who})`,
                              confirmLabel: t('orgAdmin.remove'),
                              danger: true,
                            });
                            if (ok) await run(() => api(`/admin/organizations/${org.id}/members/${m.id}`, { method: 'DELETE' }));
                          }}
                        >
                          {t('orgAdmin.remove')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.stack} aria-labelledby="org-invitations">
        <h2 id="org-invitations" className={styles.subtitle}>
          {t('orgAdmin.invitationsTitle', { count: formatNumber(org.invitations.length) })}
        </h2>
        {org.invitations.length === 0 ? (
          <EmptyState title={t('orgAdmin.noInvitations')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>{t('orgAdmin.invitationsTitle', { count: formatNumber(org.invitations.length) })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('orgAdmin.colValue')}</th>
                  <th scope="col">{t('orgAdmin.colInvited')}</th>
                  <th scope="col">{t('orgAdmin.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {org.invitations.map((i) => (
                  <tr key={i.id}>
                    <th scope="row" className={styles.wrap}>
                      {i.value}
                    </th>
                    <td className={styles.nowrap}>{formatDate(i.invitedAt)}</td>
                    <td className={styles.actions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const ok = await confirm({ title: t('orgAdmin.cancelTitle'), body: `${t('orgAdmin.cancelBody')} (${i.value})`, confirmLabel: t('orgAdmin.cancel'), danger: true });
                          if (ok) await run(() => api(`/admin/organizations/${org.id}/invitations/${i.id}`, { method: 'DELETE' }));
                        }}
                      >
                        {t('orgAdmin.cancel')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
