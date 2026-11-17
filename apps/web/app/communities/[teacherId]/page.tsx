'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  COMMUNITY_COMMENT_MAX,
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_POST_MAX,
  formatUbDateTime,
  liveState,
  type CommunityCommentPage,
  type CommunityCommentView,
  type CommunityFeed,
  type CommunityLikeState,
  type CommunityLiveItem,
  type CommunityOverview,
  type CommunityPostView,
  type UploadTicket,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { uploadFile } from '@/lib/upload';
import { Markdown } from '../../markdown';

const MB = 1024 * 1024;
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

/** Багшийн community: нийтлэл, сэтгэгдэл, like, pin, удахгүй болох live хичээлүүд. */
export default function CommunityPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = use(params);
  const router = useRouter();
  const [overview, setOverview] = useState<CommunityOverview | null>(null);
  const [pinned, setPinned] = useState<CommunityPostView[]>([]);
  const [posts, setPosts] = useState<CommunityPostView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusPost, setFocusPost] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && err.status === 401) router.replace(`/login?next=/communities/${teacherId}`);
      else if (err instanceof ApiRequestError && (err.code === 'COMMUNITY_MEMBERS_ONLY' || err.code === 'COMMUNITY_REMOVED'))
        setDenied(err.code);
      else setError(errorText(err));
    },
    [router, teacherId],
  );

  const loadPosts = useCallback(
    async (before?: string) => {
      try {
        const r = await api<CommunityFeed>(`/communities/${teacherId}/posts${before ? `?before=${before}` : ''}`);
        if (!before) setPinned(r.data.pinned);
        setPosts((prev) => (before && prev ? [...prev, ...r.data.items] : r.data.items));
        setCursor(r.data.nextCursor);
      } catch (err) {
        fail(err);
      }
    },
    [teacherId, fail],
  );

  useEffect(() => {
    setFocusPost(new URLSearchParams(window.location.search).get('post'));
    api<CommunityOverview>(`/communities/${teacherId}`)
      .then((r) => {
        setOverview(r.data);
        void loadPosts();
      })
      .catch(fail);
  }, [teacherId, loadPosts, fail]);

  /** Нийтлэлийг аль ч жагсаалтаас шинэчлэх / хасах; pin төлөв өөрчлөгдвөл жагсаалт хооронд зөөнө. */
  function replace(updated: CommunityPostView) {
    const without = (list: CommunityPostView[]) => list.filter((p) => p.id !== updated.id);
    const was = [...pinned, ...(posts ?? [])].find((p) => p.id === updated.id);
    if (was && was.pinned !== updated.pinned) {
      if (updated.pinned) {
        setPinned((prev) => [updated, ...without(prev)]);
        setPosts((prev) => (prev ? without(prev) : prev));
      } else {
        setPinned((prev) => without(prev));
        setPosts((prev) =>
          prev ? [...without(prev), updated].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : prev,
        );
      }
      return;
    }
    const swap = (list: CommunityPostView[]) => list.map((p) => (p.id === updated.id ? updated : p));
    setPinned(swap);
    setPosts((prev) => (prev ? swap(prev) : prev));
  }

  function removed(id: string) {
    setPinned((prev) => prev.filter((p) => p.id !== id));
    setPosts((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  if (denied) {
    return (
      <main className="page" style={{ display: 'grid', gap: 12 }}>
        <Link href="/communities">{t('community.back')}</Link>
        <p role="alert" style={{ margin: 0 }}>
          {denied === 'COMMUNITY_REMOVED' ? t('community.removed') : t('community.membersOnly')}
        </p>
        {denied === 'COMMUNITY_MEMBERS_ONLY' && (
          <Link className="btn" style={{ justifySelf: 'start' }} href={`/teachers/${teacherId}`}>
            {t('community.seeCourses')}
          </Link>
        )}
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="page">
        <Link href="/communities">{t('community.back')}</Link>
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  const isTeacher = overview.role === 'TEACHER';
  return (
    <main className="page wide" style={{ display: 'grid', gap: 16 }}>
      <Link href="/communities">{t('community.back')}</Link>
      <div className="teacher-box">
        {overview.teacher.avatarUrl ? <img className="avatar avatar-lg" src={overview.teacher.avatarUrl} alt="" /> : <div className="avatar avatar-lg" />}
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ margin: 0 }}>{t('community.heading', { name: overview.teacher.name ?? '' })}</h1>
          <small className="muted">
            {t('community.memberCount', { count: overview.memberCount })} · {t(`community.role${overview.role}`)}
          </small>
        </div>
        {isTeacher && (
          <Link className="btn btn-ghost" style={{ marginLeft: 'auto' }} href="/teacher/community">
            {t('community.membersLink')}
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
      <div className="community-layout">
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Composer teacherId={teacherId} onPosted={(p) => setPosts((prev) => [p, ...(prev ?? [])])} />
          {[...pinned, ...(posts ?? [])].map((p) => (
            <PostCard
              key={p.id}
              post={p}
              canPin={isTeacher}
              initiallyOpen={p.id === focusPost}
              onChange={replace}
              onDeleted={() => removed(p.id)}
            />
          ))}
          {posts?.length === 0 && pinned.length === 0 && <p className="muted">{t('community.noPosts')}</p>}
          {cursor && (
            <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => void loadPosts(cursor)}>
              {t('community.loadMore')}
            </button>
          )}
        </div>
        <LiveCalendar items={overview.upcomingLive} />
      </div>
    </main>
  );
}

function LiveCalendar({ items }: { items: CommunityLiveItem[] }) {
  return (
    <aside className="card" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <strong>{t('community.liveTitle')}</strong>
      {items.length === 0 && <small className="muted">{t('community.liveEmpty')}</small>}
      {items.map((l) => {
        const state = liveState(l.startsAt, l.durationMinutes);
        return (
          <div key={l.lessonId} style={{ display: 'grid', gap: 2 }}>
            <span>
              <strong>{formatUbDateTime(l.startsAt)}</strong>
              {state === 'LIVE' && <span className="pill" style={{ marginLeft: 6 }}>{t('live.stateLIVE')}</span>}
            </span>
            <span>{l.title}</span>
            <small className="muted">
              {l.courseTitle} · {t('live.when', { startsAt: formatUbDateTime(l.startsAt), duration: l.durationMinutes })}
            </small>
            {l.canJoin ? (
              <Link href={`/courses/${l.courseId}/lessons/${l.lessonId}`}>{t('community.liveOpen')}</Link>
            ) : (
              <Link className="muted" href={`/courses/${l.courseId}`}>
                {t('community.liveLocked')}
              </Link>
            )}
          </div>
        );
      })}
    </aside>
  );
}

function Composer({ teacherId, onPosted }: { teacherId: string; onPosted: (p: CommunityPostView) => void }) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim() && !file) return setError(t('community.emptyPost'));
    if (file && file.size > COMMUNITY_IMAGE_MAX_BYTES) return setError(t('community.imageTooLarge', { max: COMMUNITY_IMAGE_MAX_BYTES / MB }));
    setBusy(true);
    try {
      let imageKey: string | undefined;
      if (file) {
        const ticket = (
          await api<UploadTicket>(`/communities/${teacherId}/uploads`, {
            method: 'POST',
            body: { fileName: file.name, size: file.size, contentType: file.type || 'application/octet-stream' },
          })
        ).data;
        await uploadFile(ticket, file);
        imageKey = ticket.key;
      }
      const payload = { ...(body.trim() ? { body } : {}), ...(imageKey ? { imageKey } : {}) };
      onPosted((await api<CommunityPostView>(`/communities/${teacherId}/posts`, { method: 'POST', body: payload })).data);
      setBody('');
      setFile(null);
      setFormKey((k) => k + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={submit} className="card" style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid', gap: 4 }}>
        {t('community.composerLabel')}
        <textarea
          className="input"
          rows={4}
          maxLength={COMMUNITY_POST_MAX}
          placeholder={t('community.composerPlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <small className="muted">{t('community.imageLabel', { max: COMMUNITY_IMAGE_MAX_BYTES / MB })}</small>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
      <button className="btn" disabled={busy} style={{ justifySelf: 'start' }}>
        {busy ? t('community.publishing') : t('community.publish')}
      </button>
    </form>
  );
}

function AuthorLine({ author, at, editedAt }: { author: CommunityPostView['author']; at: string; editedAt?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {author.avatarUrl ? <img className="avatar" src={author.avatarUrl} alt="" /> : <div className="avatar" />}
      <strong>{author.name ?? t('community.unnamed')}</strong>
      {author.isTeacher && <span className="pill">{t('community.teacherBadge')}</span>}
      <small className="muted">{formatDate(at)}</small>
      {editedAt && <small className="muted">· {t('community.edited', { date: formatDate(editedAt) })}</small>}
    </div>
  );
}

/** Нийтлэл/сэтгэгдлийн текст засах inline форм. */
function InlineEdit({
  initial,
  max,
  onSave,
  onCancel,
}: {
  initial: string;
  max: number;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 6 }}>
      <textarea className="input" rows={3} maxLength={max} value={value} aria-label={t('community.edit')} onChange={(e) => setValue(e.target.value)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-small" disabled={busy}>
          {busy ? t('community.saving') : t('community.save')}
        </button>
        <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={onCancel}>
          {t('community.cancel')}
        </button>
      </div>
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
    </form>
  );
}

function HiddenNotice({ hidden, reason, staff }: { hidden: boolean; reason: string | null; staff: boolean }) {
  if (!hidden) return null;
  return (
    <small role="status" style={{ color: 'var(--err)' }}>
      {t(staff ? 'community.hiddenNoticeStaff' : 'community.hiddenNotice', { reason: reason ?? '' })}
    </small>
  );
}

function PostCard({
  post,
  canPin,
  initiallyOpen,
  onChange,
  onDeleted,
}: {
  post: CommunityPostView;
  canPin: boolean;
  initiallyOpen: boolean;
  onChange: (p: CommunityPostView) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [initiallyOpen]);

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const toggleLike = () =>
    act(async () => {
      const r = await api<CommunityLikeState>(`/community/posts/${post.id}/like`, { method: post.likedByMe ? 'DELETE' : 'PUT' });
      onChange({ ...post, likedByMe: r.data.liked, likeCount: r.data.likeCount });
    });
  const togglePin = () =>
    act(async () => {
      onChange((await api<CommunityPostView>(`/community/posts/${post.id}/pin`, { method: post.pinned ? 'DELETE' : 'PUT' })).data);
    });
  const remove = () =>
    act(async () => {
      if (!window.confirm(t('community.deletePostConfirm'))) return;
      await api(`/community/posts/${post.id}`, { method: 'DELETE' });
      onDeleted();
    });

  return (
    <article id={`post-${post.id}`} className="card" style={{ display: 'grid', gap: 8 }}>
      {post.pinned && <small className="pill" style={{ justifySelf: 'start' }}>{t('community.pinned')}</small>}
      <AuthorLine author={post.author} at={post.createdAt} editedAt={post.editedAt} />
      <HiddenNotice hidden={post.hidden} reason={post.hiddenReason} staff={post.body !== '' || post.imageUrl !== null} />
      {editing ? (
        <InlineEdit
          initial={post.body}
          max={COMMUNITY_POST_MAX}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            onChange((await api<CommunityPostView>(`/community/posts/${post.id}`, { method: 'PATCH', body: { body } })).data);
            setEditing(false);
          }}
        />
      ) : (
        post.body && <Markdown source={post.body} />
      )}
      {post.imageUrl && <img src={post.imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={post.likedByMe ? 'btn btn-small' : 'btn btn-ghost btn-small'} aria-pressed={post.likedByMe} onClick={() => void toggleLike()}>
          {post.likedByMe ? t('community.unlike', { count: post.likeCount }) : t('community.like', { count: post.likeCount })}
        </button>
        <button type="button" className="btn btn-ghost btn-small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t('community.hideComments') : t('community.comments', { count: post.commentCount })}
        </button>
        {canPin && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void togglePin()}>
            {post.pinned ? t('community.unpin') : t('community.pin')}
          </button>
        )}
        {post.canEdit && !editing && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(true)}>
            {t('community.edit')}
          </button>
        )}
        {post.canDelete && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void remove()}>
            {t('community.delete')}
          </button>
        )}
      </div>
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
      {open && <Comments post={post} onCountChange={(n) => onChange({ ...post, commentCount: n })} />}
    </article>
  );
}

function Comments({ post, onCountChange }: { post: CommunityPostView; onCountChange: (n: number) => void }) {
  const [items, setItems] = useState<CommunityCommentView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (after?: string) => {
      try {
        const r = await api<CommunityCommentPage>(`/community/posts/${post.id}/comments${after ? `?after=${after}` : ''}`);
        setItems((prev) => (after && prev ? [...prev, ...r.data.items] : r.data.items));
        setCursor(r.data.nextCursor);
      } catch (err) {
        setError(errorText(err));
      }
    },
    [post.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const c = (await api<CommunityCommentView>(`/community/posts/${post.id}/comments`, { method: 'POST', body: { body } })).data;
      setItems((prev) => [...(prev ?? []), c]);
      setBody('');
      onCountChange(post.commentCount + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('community.deleteCommentConfirm'))) return;
    setError(null);
    try {
      await api(`/community/comments/${id}`, { method: 'DELETE' });
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onCountChange(Math.max(0, post.commentCount - 1));
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {items?.map((c) => (
        <div key={c.id} style={{ display: 'grid', gap: 4 }}>
          <AuthorLine author={c.author} at={c.createdAt} editedAt={c.editedAt} />
          <HiddenNotice hidden={c.hidden} reason={c.hiddenReason} staff={c.body !== ''} />
          {editingId === c.id ? (
            <InlineEdit
              initial={c.body}
              max={COMMUNITY_COMMENT_MAX}
              onCancel={() => setEditingId(null)}
              onSave={async (body) => {
                const r = (await api<CommunityCommentView>(`/community/comments/${c.id}`, { method: 'PATCH', body: { body } })).data;
                setItems((prev) => prev?.map((x) => (x.id === r.id ? r : x)) ?? null);
                setEditingId(null);
              }}
            />
          ) : (
            c.body && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.body}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {c.canEdit && editingId !== c.id && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(c.id)}>
                {t('community.edit')}
              </button>
            )}
            {c.canDelete && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void remove(c.id)}>
                {t('community.delete')}
              </button>
            )}
          </div>
        </div>
      ))}
      {cursor && (
        <button type="button" className="btn btn-ghost btn-small" style={{ justifySelf: 'start' }} onClick={() => void load(cursor)}>
          {t('community.loadMore')}
        </button>
      )}
      <form onSubmit={send} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <textarea
          className="input"
          rows={2}
          style={{ flex: '1 1 240px' }}
          maxLength={COMMUNITY_COMMENT_MAX}
          placeholder={t('community.commentPlaceholder')}
          aria-label={t('community.commentPlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn" disabled={busy || !body.trim()}>
          {t('community.sendComment')}
        </button>
      </form>
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
    </div>
  );
}
