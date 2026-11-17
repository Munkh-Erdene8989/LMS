/** Багшийн community (ticket 19). */

export const COMMUNITY_POST_MAX = 5000;
export const COMMUNITY_COMMENT_MAX = 2000;
export const COMMUNITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMUNITY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
/** Нэг community-д зэрэг pin хийж болох нийтлэлийн тоо */
export const COMMUNITY_PIN_MAX = 3;
export const COMMUNITY_REMOVE_REASON_MAX = 500;

/**
 * Үзэгчийн эрх: `TEACHER` — community-ийн эзэн (pin, устгах, гишүүн хасах), `ADMIN` — платформын модератор
 * (устгах), `MEMBER` — тухайн багшийн ямар нэг lesson эзэмшигч.
 */
export type CommunityRole = 'TEACHER' | 'ADMIN' | 'MEMBER';

export interface CommunityPerson {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Community-ийн live хуанлийн мөр. Линк энд гарахгүй — хичээлийн хуудсанд (ticket 14). */
export interface CommunityLiveItem {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  endsAt: string;
  /** Үзэгч энэ lesson-ыг эзэмшдэг (эсвэл багш) — хичээлийн хуудаснаас нэгдэнэ */
  canJoin: boolean;
}

/** `GET /communities/:teacherId` */
export interface CommunityOverview {
  teacher: CommunityPerson & { expertise: string | null };
  role: CommunityRole;
  memberCount: number;
  upcomingLive: CommunityLiveItem[];
}

/** `GET /communities` — миний гишүүн (эсвэл эзэн) community-ууд */
export interface CommunitySummary {
  teacher: CommunityPerson;
  role: CommunityRole;
  postCount: number;
  lastPostAt: string | null;
}

export interface CommunityPostView {
  id: string;
  author: CommunityPerson & { isTeacher: boolean };
  body: string;
  /** Богино хугацаатай signed URL */
  imageUrl: string | null;
  pinned: boolean;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  canDelete: boolean;
  createdAt: string;
}

export interface CommunityFeed {
  /** Pin хийсэн нийтлэлүүд — зөвхөн эхний хуудсанд (`before`-гүй) */
  pinned: CommunityPostView[];
  items: CommunityPostView[];
  nextCursor: string | null;
}

export interface CommunityCommentView {
  id: string;
  author: CommunityPerson & { isTeacher: boolean };
  body: string;
  canDelete: boolean;
  createdAt: string;
}

export interface CommunityCommentPage {
  items: CommunityCommentView[];
  nextCursor: string | null;
}

export interface CommunityLikeState {
  liked: boolean;
  likeCount: number;
}

/** Багшийн гишүүдийн жагсаалт (`GET /teacher/community/members`) */
export interface CommunityMember extends CommunityPerson {
  /** Анхны эзэмшил үүссэн огноо */
  since: string;
  removed: { reason: string | null; at: string } | null;
}
