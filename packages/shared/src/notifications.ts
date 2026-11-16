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
