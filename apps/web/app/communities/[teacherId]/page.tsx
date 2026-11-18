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
import { formatDate, formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';
import { uploadFile } from '@/lib/upload';
import { Markdown } from '../../markdown';
import { useUnsavedWarning } from '../../teacher/use-unsaved';
import { Button, LinkButton } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton, SkeletonText } from '../../ui/skeleton';
import s from '../communities.module.css';

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
      <div className="page-narrow">
        <div className={s.stack}>
          <Link href="/communities" className={s.back}>
            {t('community.back')}
          </Link>
          <div role="alert" className={s.denied}>
            <p>{denied === 'COMMUNITY_REMOVED' ? t('community.removed') : t('community.membersOnly')}</p>
            {denied === 'COMMUNITY_MEMBERS_ONLY' && (
              <LinkButton href={`/teachers/${teacherId}`}>{t('community.seeCourses')}</LinkButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="page-narrow">
        <div className={s.stack}>
          <Link href="/communities" className={s.back}>
            {t('community.back')}
          </Link>
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : (
            <div className={s.head} aria-busy="true" aria-label={t('me.loading')}>
              <Skeleton width={80} height={80} radius="50%" />
              <span className={s.headText}>
                <Skeleton width={220} height="1.5em" />
                <Skeleton width={140} height="0.9em" />
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isTeacher = overview.role === 'TEACHER';
  return (
    <div className="page wide">
      <div className={s.stack}>
        <Link href="/communities" className={s.back}>
          {t('community.back')}
        </Link>
        <div className={s.head}>
          {overview.teacher.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={`${s.avatar} ${s.avatarLg}`} src={overview.teacher.avatarUrl} alt="" width={80} height={80} />
          ) : (
            <span className={`${s.avatar} ${s.avatarLg}`} aria-hidden="true" />
          )}
          <div className={s.headText}>
            <h1>{t('community.heading', { name: overview.teacher.name ?? '' })}</h1>
            <span className={s.meta}>
              {t('community.memberCount', { count: overview.memberCount })} · {t(`community.role${overview.role}`)}
            </span>
          </div>
          {isTeacher && (
            <LinkButton variant="ghost" className={s.headAction} href="/teacher/community">
              {t('community.membersLink')}
            </LinkButton>
          )}
        </div>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <div className={s.layout}>
          <div className={s.feed}>
            <Composer teacherId={teacherId} onPosted={(p) => setPosts((prev) => [p, ...(prev ?? [])])} />
            {posts === null && !error && (
              <div className="card" aria-busy="true" aria-label={t('me.loading')}>
                <SkeletonText lines={3} />
              </div>
            )}
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
            {posts?.length === 0 && pinned.length === 0 && <EmptyState title={t('community.noPosts')} />}
            {cursor && (
              <Button variant="secondary" onClick={() => void loadPosts(cursor)}>
                {t('community.loadMore')}
              </Button>
            )}
          </div>
          <LiveCalendar items={overview.upcomingLive} />
        </div>
      </div>
    </div>
  );
}

function LiveCalendar({ items }: { items: CommunityLiveItem[] }) {
  return (
    <aside className={`card ${s.live}`} aria-labelledby="community-live-title">
      <h2 id="community-live-title" className={s.liveTitle}>
        {t('community.liveTitle')}
      </h2>
      {items.length === 0 && <span className={s.meta}>{t('community.liveEmpty')}</span>}
      {items.map((l) => {
        const state = liveState(l.startsAt, l.durationMinutes);
        return (
          <div key={l.lessonId} className={s.liveItem}>
            <span>
              <strong>{formatUbDateTime(l.startsAt)}</strong>{' '}
              {state === 'LIVE' && <span className={`${s.pill} ${s.pillAccent}`}>{t('live.stateLIVE')}</span>}
            </span>
            <span>{l.title}</span>
            <span className={s.meta}>
              {l.courseTitle} · {t('live.when', { startsAt: formatUbDateTime(l.startsAt), duration: l.durationMinutes })}
            </span>
            {l.canJoin ? (
              <Link className={s.liveLink} href={`/courses/${l.courseId}/lessons/${l.lessonId}`}>
                {t('community.liveOpen')}
              </Link>
            ) : (
              <Link className={s.liveLocked} href={`/courses/${l.courseId}`}>
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
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useUnsavedWarning(!busy && (body.trim() !== '' || file !== null));

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
    <form key={formKey} onSubmit={submit} className={`card ${s.composer}`}>
      <label className={s.field}>
        {t('community.composerLabel')}
        <textarea
          className={`input ${s.textarea}`}
          rows={4}
          maxLength={COMMUNITY_POST_MAX}
          placeholder={t('community.composerPlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <span className={s.counter} aria-hidden="true">
          {body.length}/{COMMUNITY_POST_MAX}
        </span>
      </label>
      <label className={s.field}>
        <span className={s.hint}>{t('community.imageLabel', { max: COMMUNITY_IMAGE_MAX_BYTES / MB })}</span>
        <input
          className={s.fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {preview && (
        <div className={s.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.previewImg} src={preview} alt="" width={64} height={64} />
          <span>{file?.name}</span>
        </div>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div>
        <Button type="submit" loading={busy} loadingLabel={t('community.publishing')}>
          {t('community.publish')}
        </Button>
      </div>
    </form>
  );
}

function AuthorLine({ author, at, editedAt }: { author: CommunityPostView['author']; at: string; editedAt?: string | null }) {
  return (
    <div className={s.author}>
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.authorAvatar} src={author.avatarUrl} alt="" width={36} height={36} loading="lazy" />
      ) : (
        <span className={s.authorAvatar} aria-hidden="true" />
      )}
      <span className={s.authorName}>{author.name ?? t('community.unnamed')}</span>
      {author.isTeacher && <span className={s.pill}>{t('community.teacherBadge')}</span>}
      <time className={s.time} dateTime={at} title={formatDate(at)}>
        {formatRelative(at)}
      </time>
      {editedAt && <span className={s.time}>· {t('community.edited', { date: formatRelative(editedAt) })}</span>}
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

  useUnsavedWarning(!busy && value !== initial);

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
    <form onSubmit={submit} className={s.inlineEdit}>
      <textarea
        className={`input ${s.textarea}`}
        rows={3}
        maxLength={max}
        value={value}
        aria-label={t('community.edit')}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className={s.actions}>
        <Button type="submit" size="sm" loading={busy} loadingLabel={t('community.saving')}>
          {t('community.save')}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {t('community.cancel')}
        </Button>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </form>
  );
}

function HiddenNotice({ hidden, reason, staff }: { hidden: boolean; reason: string | null; staff: boolean }) {
  if (!hidden) return null;
  return (
    <p role="status" className={s.hidden}>
      {t(staff ? 'community.hiddenNoticeStaff' : 'community.hiddenNotice', { reason: reason ?? '' })}
    </p>
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
  const confirm = useConfirm();
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
      const ok = await confirm({
        title: t('miscUi.deletePostTitle'),
        body: t('community.deletePostConfirm'),
        confirmLabel: t('community.delete'),
        danger: true,
      });
      if (!ok) return;
      await api(`/community/posts/${post.id}`, { method: 'DELETE' });
      onDeleted();
    });

  return (
    <article id={`post-${post.id}`} className={`card ${s.post} ${post.pinned ? s.postPinned : ''}`}>
      {post.pinned && <span className={`${s.pill} ${s.pillAccent}`}>{t('community.pinned')}</span>}
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
      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.postImage} src={post.imageUrl} alt={t('miscUi.postImageAlt')} loading="lazy" decoding="async" />
      )}
      <div className={s.actions}>
        <Button variant={post.likedByMe ? 'primary' : 'ghost'} size="sm" aria-pressed={post.likedByMe} onClick={() => void toggleLike()}>
          {post.likedByMe ? t('community.unlike', { count: post.likeCount }) : t('community.like', { count: post.likeCount })}
        </Button>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t('community.hideComments') : t('community.comments', { count: post.commentCount })}
        </Button>
        {canPin && (
          <Button variant="ghost" size="sm" onClick={() => void togglePin()}>
            {post.pinned ? t('community.unpin') : t('community.pin')}
          </Button>
        )}
        {post.canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t('community.edit')}
          </Button>
        )}
        {post.canDelete && (
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            {t('community.delete')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {open && <Comments post={post} onCountChange={(n) => onChange({ ...post, commentCount: n })} />}
    </article>
  );
}

function Comments({ post, onCountChange }: { post: CommunityPostView; onCountChange: (n: number) => void }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<CommunityCommentView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useUnsavedWarning(!busy && body.trim() !== '');

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
    const ok = await confirm({
      title: t('miscUi.deleteCommentTitle'),
      body: t('community.deleteCommentConfirm'),
      confirmLabel: t('community.delete'),
      danger: true,
    });
    if (!ok) return;
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
    <div className={s.comments}>
      {items === null && !error && (
        <div aria-busy="true" aria-label={t('me.loading')}>
          <SkeletonText lines={2} />
        </div>
      )}
      {items?.map((c) => (
        <div key={c.id} className={s.comment}>
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
            c.body && <p className={s.commentBody}>{c.body}</p>
          )}
          <div className={s.actions}>
            {c.canEdit && editingId !== c.id && (
              <Button variant="ghost" size="sm" onClick={() => setEditingId(c.id)}>
                {t('community.edit')}
              </Button>
            )}
            {c.canDelete && (
              <Button variant="ghost" size="sm" onClick={() => void remove(c.id)}>
                {t('community.delete')}
              </Button>
            )}
          </div>
        </div>
      ))}
      {cursor && (
        <div>
          <Button variant="secondary" size="sm" onClick={() => void load(cursor)}>
            {t('community.loadMore')}
          </Button>
        </div>
      )}
      {post.hidden ? (
        <p className={s.meta}>{t('community.commentsLocked')}</p>
      ) : (
        <form onSubmit={send} className={s.commentForm}>
          <textarea
            className={`input ${s.commentInput}`}
            rows={2}
            maxLength={COMMUNITY_COMMENT_MAX}
            placeholder={t('community.commentPlaceholder')}
            aria-label={t('community.commentPlaceholder')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" disabled={!body.trim()} loading={busy}>
            {t('community.sendComment')}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
