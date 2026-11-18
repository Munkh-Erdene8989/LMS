/** `GET /notifications` — API translation-аас бэлэн болгосон текст буцаана. */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Web доторх зам (жишээ нь `/me`) */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  /** Дараагийн хуудсыг авах `before` утга; дууссан бол null */
  nextCursor: string | null;
}

export interface UnreadCount {
  count: number;
}

/**
 * Мэдэгдлийн ангилал (хэрэглэгч имэйлийг ангилалаар нь унтраана). Шинэ ангилал нэмэхдээ API талын
 * `notifications/categories.ts`-д төрлүүдийг нь холбоно.
 */
export const NOTIFICATION_CATEGORIES = ['COMMUNITY_COMMENT', 'TEACHER_SALES'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** `GET /notifications/preferences` */
export interface NotificationPreferenceView {
  category: NotificationCategory;
  /** false бол имэйл илгээхгүй, in-app мэдэгдэл хэвээр */
  emailEnabled: boolean;
}
